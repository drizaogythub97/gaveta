import { Printer } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_LABELS,
  type Period,
  rangeForPeriod,
  toDateInputValue,
} from "@/lib/dashboard/dates";
import { formatBRL } from "@/lib/products/format";
import type { CashSession } from "@/lib/types/cash";
import type { Expense, ExpenseCategory } from "@/lib/types/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/types/expenses";
import { PAYMENT_METHOD_LABELS, type SaleRow } from "@/lib/types/sales";
import type { PaymentMethod } from "@/app/(app)/caixa/actions";
import { cn } from "@/lib/utils";

import { SALE_SORTS, type SaleSort } from "@/lib/financeiro/sort";

import { ExpensesClient } from "./expenses-client";
import { ToggleSaleStatusButton } from "./toggle-sale-status-button";
import { FinancialClient } from "./financial-client";
import { SummaryView, type SummaryData } from "./summary-view";

export const metadata = {
  title: "Financeiro",
};

type Tab = "vendas" | "despesas" | "resumo";
const VALID_TABS: ReadonlySet<Tab> = new Set(["vendas", "despesas", "resumo"]);
const TAB_LABELS: Record<Tab, string> = {
  vendas: "Vendas",
  despesas: "Despesas",
  resumo: "Resumo",
};

const VALID_PERIODS: ReadonlySet<Period> = new Set([
  "today",
  "7d",
  "30d",
  "month",
  "custom",
]);

const VALID_SORTS: ReadonlySet<SaleSort> = new Set(SALE_SORTS);

// Mapeia a ordenação escolhida para a coluna/direção da query de vendas.
const SORT_ORDER: Record<
  SaleSort,
  { column: "created_at" | "total"; ascending: boolean }
> = {
  recent: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  high: { column: "total", ascending: false },
  low: { column: "total", ascending: true },
};

const ALL_METHODS: PaymentMethod[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_avista",
  "credito_parcelado",
  "vale",
];

// Vendas por página na listagem. Os totais do período NÃO dependem disso:
// são agregados no banco (RPC sales_summary), imunes ao corte de 1000
// linhas do PostgREST.
const SALES_PAGE_SIZE = 20;

// Linha devolvida pela RPC sales_summary.
type SalesSummaryRow = {
  gross_total: number;
  fees_total: number;
  completed_count: number;
  voided_count: number;
};

const EMPTY_SUMMARY: SalesSummaryRow = {
  gross_total: 0,
  fees_total: 0,
  completed_count: 0,
  voided_count: 0,
};

function pickString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | string[] | undefined): number {
  const n = Number.parseInt(pickString(value) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parseMethods(value: string | string[] | undefined): PaymentMethod[] {
  const raw = Array.isArray(value) ? value : value ? value.split(",") : [];
  const valid = raw.filter((m): m is PaymentMethod =>
    ALL_METHODS.includes(m as PaymentMethod),
  );
  return Array.from(new Set(valid));
}

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tabParam = pickString(params.tab);
  const tab: Tab =
    tabParam && VALID_TABS.has(tabParam as Tab) ? (tabParam as Tab) : "vendas";

  const periodParam = pickString(params.period);
  const period: Period =
    periodParam && VALID_PERIODS.has(periodParam as Period)
      ? (periodParam as Period)
      : "today";
  const fromParam = pickString(params.from);
  const toParam = pickString(params.to);
  const methods = parseMethods(params.methods);

  const sortParam = pickString(params.sort);
  const sort: SaleSort =
    sortParam && VALID_SORTS.has(sortParam as SaleSort)
      ? (sortParam as SaleSort)
      : "recent";

  const page = parsePage(params.page);

  const { from, to } = rangeForPeriod(period, fromParam, toParam);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Acompanhe as vendas, registre despesas e veja o resumo do período.
        </p>
      </header>

      <TabNav current={tab} params={params} />

      <FinancialClient
        period={period}
        from={toDateInputValue(from)}
        to={toDateInputValue(to)}
        selectedMethods={methods}
        sort={sort}
        showMethods={tab === "vendas"}
        showSort={tab === "vendas"}
      />

      {tab === "vendas" ? (
        <VendasTab
          from={from}
          to={to}
          period={period}
          methods={methods}
          sort={sort}
          page={page}
          params={params}
        />
      ) : tab === "despesas" ? (
        <DespesasTab from={from} to={to} />
      ) : (
        <ResumoTab from={from} to={to} period={period} />
      )}
    </section>
  );
}

function buildTabHref(
  params: Record<string, string | string[] | undefined>,
  tab: Tab,
): string {
  const next = new URLSearchParams();
  for (const key of ["period", "from", "to", "sort"] as const) {
    const v = pickString(params[key]);
    if (v) next.set(key, v);
  }
  next.set("tab", tab);
  return `?${next.toString()}`;
}

function TabNav({
  current,
  params,
}: {
  current: Tab;
  params: Record<string, string | string[] | undefined>;
}) {
  return (
    <nav aria-label="Seções do financeiro" className="flex flex-wrap gap-2">
      {(["vendas", "despesas", "resumo"] as Tab[]).map((t) => {
        const active = t === current;
        return (
          <Link
            key={t}
            href={buildTabHref(params, t)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-12 items-center rounded-lg px-5 text-base font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </Link>
        );
      })}
    </nav>
  );
}

// --------------------------------------------------------------------- Vendas
async function VendasTab({
  from,
  to,
  period,
  methods,
  sort,
  page,
  params,
}: {
  from: string;
  to: string;
  period: Period;
  methods: PaymentMethod[];
  sort: SaleSort;
  page: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createClient();

  // Totais do período agregados no banco (exatos, independem da paginação).
  const { data: summaryData, error: summaryError } = await supabase
    .rpc("sales_summary", {
      p_from: from,
      p_to: to,
      p_methods: methods.length > 0 ? methods : null,
    })
    .maybeSingle();
  const summary = (summaryData ?? EMPTY_SUMMARY) as SalesSummaryRow;

  const grossRevenue = Number(summary.gross_total);
  const feesTotal = Number(summary.fees_total);
  const netRevenue = Math.round((grossRevenue - feesTotal) * 100) / 100;
  const completedCount = Number(summary.completed_count);
  const voidedCount = Number(summary.voided_count);

  const totalSales = completedCount + voidedCount;
  const totalPages = Math.max(1, Math.ceil(totalSales / SALES_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * SALES_PAGE_SIZE;

  let query = supabase
    .from("sales")
    .select(
      "id, total, status, payment_method, installments, fee_amount, discount_amount, created_at, sale_items(id, product_id, name_snapshot, unit_price, quantity, line_total)",
    )
    .gte("created_at", from)
    .lte("created_at", to);
  if (methods.length > 0) {
    query = query.in("payment_method", methods);
  }
  const order = SORT_ORDER[sort];
  query = query.order(order.column, { ascending: order.ascending });
  // Desempate estável quando ordenado por valor.
  if (order.column !== "created_at") {
    query = query.order("created_at", { ascending: false });
  }
  query = query.range(offset, offset + SALES_PAGE_SIZE - 1);
  const { data, error: listError } = await query;
  const sales = (data ?? []) as SaleRow[];
  const error = summaryError ?? listError;

  return (
    <>
      <section className="bg-primary text-primary-foreground flex flex-col gap-3 rounded-xl p-5">
        <p className="text-base opacity-90">
          Faturamento — {PERIOD_LABELS[period]}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm opacity-80">Bruto</p>
            <p
              className="text-3xl font-bold tabular-nums sm:text-4xl"
              aria-live="polite"
            >
              {formatBRL(grossRevenue)}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-80">Taxas</p>
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">
              − {formatBRL(feesTotal)}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-80">Líquido</p>
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">
              {formatBRL(netRevenue)}
            </p>
          </div>
        </div>
        <p className="text-base opacity-90">
          {completedCount}{" "}
          {completedCount === 1 ? "venda registrada" : "vendas registradas"}
          {voidedCount > 0
            ? ` · ${voidedCount} estornada${voidedCount === 1 ? "" : "s"}`
            : ""}
          .
        </p>
      </section>

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar as vendas.
        </p>
      ) : sales.length === 0 ? (
        <div className="bg-muted/40 rounded-xl p-8 text-center">
          <p className="text-base">
            Nenhuma venda neste período. Use a Frente de Caixa para registrar
            uma.
          </p>
        </div>
      ) : (
        <>
          <SalesList sales={sales} />
          <SalesPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalSales={totalSales}
            params={params}
          />
        </>
      )}
    </>
  );
}

// Navegação entre páginas da lista de vendas, preservando filtros/ordenação.
function SalesPagination({
  currentPage,
  totalPages,
  totalSales,
  params,
}: {
  currentPage: number;
  totalPages: number;
  totalSales: number;
  params: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const key of ["tab", "period", "from", "to", "methods", "sort"] as const) {
      const v = pickString(params[key]);
      if (v) next.set(key, v);
    }
    if (target > 1) next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  const linkClass =
    "border-border text-foreground hover:bg-muted flex h-12 items-center justify-center rounded-lg border px-5 text-base font-medium";
  const disabledClass =
    "border-border text-muted-foreground flex h-12 cursor-not-allowed items-center justify-center rounded-lg border px-5 text-base font-medium opacity-50";

  return (
    <nav
      aria-label="Páginas da lista de vendas"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {currentPage > 1 ? (
        <Link href={pageHref(currentPage - 1)} className={linkClass}>
          ← Anterior
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          ← Anterior
        </span>
      )}
      <p className="text-muted-foreground text-base">
        Página <span className="text-foreground font-medium">{currentPage}</span>{" "}
        de {totalPages} · {totalSales}{" "}
        {totalSales === 1 ? "venda" : "vendas"}
      </p>
      {currentPage < totalPages ? (
        <Link href={pageHref(currentPage + 1)} className={linkClass}>
          Próxima →
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Próxima →
        </span>
      )}
    </nav>
  );
}

// ------------------------------------------------------------------- Despesas
async function DespesasTab({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();
  const fromDate = toDateInputValue(from);
  const toDate = toDateInputValue(to);
  const { data } = await supabase
    .from("expenses")
    .select("id, incurred_on, category, amount, description, created_at")
    .gte("incurred_on", fromDate)
    .lte("incurred_on", toDate)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  const expenses = (data ?? []) as Expense[];
  const total =
    Math.round(expenses.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;

  // Data padrão do formulário: hoje (não passa de "to").
  const today = toDateInputValue(new Date().toISOString());
  const defaultDate = today > toDate ? toDate : today;

  return (
    <ExpensesClient
      expenses={expenses}
      defaultDate={defaultDate}
      total={total}
    />
  );
}

// --------------------------------------------------------------------- Resumo
async function ResumoTab({
  from,
  to,
  period,
}: {
  from: string;
  to: string;
  period: Period;
}) {
  const supabase = await createClient();
  const fromDate = toDateInputValue(from);
  const toDate = toDateInputValue(to);

  // Vendas e despesas agregadas no banco (RPCs) — valores exatos mesmo com
  // milhares de linhas no período; só as sessões fechadas vêm como lista.
  const [salesRes, expensesRes, closedRes] = await Promise.all([
    supabase
      .rpc("sales_summary", { p_from: from, p_to: to, p_methods: null })
      .maybeSingle(),
    supabase.rpc("expenses_summary", { p_from: fromDate, p_to: toDate }),
    supabase
      .from("cash_sessions")
      .select(
        "id, opened_at, opening_amount, closed_at, counted_amount, expected_amount, difference_amount, status, opening_note, closing_note",
      )
      .eq("status", "closed")
      .gte("closed_at", from)
      .lte("closed_at", to)
      .order("closed_at", { ascending: false }),
  ]);

  const summary = (salesRes.data ?? EMPTY_SUMMARY) as SalesSummaryRow;
  const grossRevenue = Number(summary.gross_total);
  const feesTotal = Number(summary.fees_total);
  const netRevenue = Math.round((grossRevenue - feesTotal) * 100) / 100;

  const byCat = new Map<ExpenseCategory, number>();
  for (const row of (expensesRes.data ?? []) as {
    category: ExpenseCategory;
    total: number;
  }[]) {
    byCat.set(row.category, Number(row.total));
  }
  const expensesByCategory = EXPENSE_CATEGORIES.filter((c) => byCat.has(c)).map(
    (c) => ({ category: c, total: Math.round((byCat.get(c) ?? 0) * 100) / 100 }),
  );
  const expensesTotal =
    Math.round(
      Array.from(byCat.values()).reduce((s, v) => s + v, 0) * 100,
    ) / 100;
  const result = Math.round((netRevenue - expensesTotal) * 100) / 100;

  const closedSessions = (closedRes.data ?? []) as CashSession[];

  // Projeção do mês (estimativa), independente do período selecionado.
  const now = new Date();
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  ).toISOString();
  const { data: monthSummaryData } = await supabase
    .rpc("sales_summary", {
      p_from: monthStart,
      p_to: new Date().toISOString(),
      p_methods: null,
    })
    .maybeSingle();
  const monthSummary = (monthSummaryData ?? EMPTY_SUMMARY) as SalesSummaryRow;
  const monthSoFarNet =
    Math.round(
      (Number(monthSummary.gross_total) - Number(monthSummary.fees_total)) * 100,
    ) / 100;
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysRemaining = daysInMonth - daysElapsed;
  const dailyAvg =
    daysElapsed > 0 ? Math.round((monthSoFarNet / daysElapsed) * 100) / 100 : 0;
  const projectedMonthNet =
    Math.round((monthSoFarNet + dailyAvg * daysRemaining) * 100) / 100;

  const data: SummaryData = {
    grossRevenue,
    feesTotal,
    netRevenue,
    expensesByCategory,
    expensesTotal,
    result,
    closedSessions,
    projection: {
      monthSoFarNet,
      dailyAvg,
      daysRemaining,
      projectedMonthNet,
    },
  };

  return (
    <>
      <p className="text-muted-foreground text-base">
        Resumo de <span className="font-medium">{PERIOD_LABELS[period]}</span>.
      </p>
      <SummaryView data={data} />
    </>
  );
}

// ---------------------------------------------------------------- componentes
function SalesList({ sales }: { sales: SaleRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {sales.map((sale) => (
        <SaleCard key={sale.id} sale={sale} />
      ))}
    </ul>
  );
}

function SaleCard({ sale }: { sale: SaleRow }) {
  const voided = sale.status === "voided";
  const itemsLabel =
    sale.sale_items.length === 1 ? "1 item" : `${sale.sale_items.length} itens`;
  const net =
    Math.round((Number(sale.total) - Number(sale.fee_amount)) * 100) / 100;
  return (
    <li
      className={
        voided
          ? "ring-foreground/10 bg-muted/40 rounded-xl p-4 ring-1"
          : "ring-foreground/10 bg-card rounded-xl p-4 ring-1"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-xl font-semibold tabular-nums">
              {formatBRL(sale.total)}
            </span>
            <StatusBadge voided={voided} />
            <PaymentBadge
              method={sale.payment_method}
              installments={sale.installments}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(sale.created_at))}{" "}
            · {itemsLabel}
          </p>
          {Number(sale.discount_amount) > 0 ? (
            <p className="text-muted-foreground text-sm">
              Desconto aplicado{" "}
              <span className="text-foreground font-medium">
                {formatBRL(Number(sale.discount_amount))}
              </span>
            </p>
          ) : null}
          {Number(sale.fee_amount) > 0 ? (
            <p className="text-muted-foreground text-sm">
              Taxa{" "}
              <span className="text-foreground font-medium">
                {formatBRL(Number(sale.fee_amount))}
              </span>{" "}
              · Líquido{" "}
              <span className="text-foreground font-medium">
                {formatBRL(net)}
              </span>
            </p>
          ) : null}
          <details className="text-base">
            <summary className="text-primary cursor-pointer text-base font-medium underline-offset-4 hover:underline">
              Ver itens
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {sale.sale_items.map((it) => (
                <li
                  key={it.id}
                  className="text-foreground flex justify-between gap-2 text-base"
                >
                  <span>
                    {it.name_snapshot}{" "}
                    <span className="text-muted-foreground">
                      × {it.quantity.toString().replace(".", ",")}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatBRL(it.line_total)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            href={`/comprovante/${sale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground hover:bg-muted flex h-12 items-center justify-center gap-2 rounded-lg border px-5 text-base font-medium"
          >
            <Printer aria-hidden="true" className="size-5" />
            Imprimir venda
          </a>
          <ToggleSaleStatusButton saleId={sale.id} status={sale.status} />
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ voided }: { voided: boolean }) {
  if (!voided) {
    return (
      <span className="bg-success/15 text-success rounded-full px-2 py-0.5 text-xs font-medium">
        Concluída
      </span>
    );
  }
  return (
    <span className="bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs font-medium">
      Estornada
    </span>
  );
}

function PaymentBadge({
  method,
  installments,
}: {
  method: SaleRow["payment_method"];
  installments: number | null;
}) {
  const label =
    method === "credito_parcelado" && installments
      ? `Crédito ${installments}x`
      : PAYMENT_METHOD_LABELS[method];
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
      {label}
    </span>
  );
}
