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

import { toggleSaleStatus } from "./actions";
import { ExpensesClient } from "./expenses-client";
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

const ALL_METHODS: PaymentMethod[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_avista",
  "credito_parcelado",
  "vale",
];

function pickString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
        showMethods={tab === "vendas"}
      />

      {tab === "vendas" ? (
        <VendasTab from={from} to={to} period={period} methods={methods} />
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
  for (const key of ["period", "from", "to"] as const) {
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
}: {
  from: string;
  to: string;
  period: Period;
  methods: PaymentMethod[];
}) {
  const supabase = await createClient();
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
  const { data, error } = await query.order("created_at", { ascending: false });
  const sales = (data ?? []) as SaleRow[];

  const completed = sales.filter((s) => s.status === "completed");
  const grossRevenue = completed.reduce((sum, s) => sum + Number(s.total), 0);
  const feesTotal = completed.reduce((sum, s) => sum + Number(s.fee_amount), 0);
  const netRevenue = Math.round((grossRevenue - feesTotal) * 100) / 100;
  const completedCount = completed.length;
  const voidedCount = sales.filter((s) => s.status === "voided").length;

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
        <SalesList sales={sales} />
      )}
    </>
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

  const [salesRes, expensesRes, closedRes] = await Promise.all([
    supabase
      .from("sales")
      .select("total, fee_amount, status")
      .gte("created_at", from)
      .lte("created_at", to)
      .eq("status", "completed"),
    supabase
      .from("expenses")
      .select("category, amount")
      .gte("incurred_on", fromDate)
      .lte("incurred_on", toDate),
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

  const sales = (salesRes.data ?? []) as {
    total: number;
    fee_amount: number;
  }[];
  const grossRevenue =
    Math.round(sales.reduce((s, r) => s + Number(r.total), 0) * 100) / 100;
  const feesTotal =
    Math.round(sales.reduce((s, r) => s + Number(r.fee_amount), 0) * 100) / 100;
  const netRevenue = Math.round((grossRevenue - feesTotal) * 100) / 100;

  const expenses = (expensesRes.data ?? []) as {
    category: ExpenseCategory;
    amount: number;
  }[];
  const byCat = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
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
  const { data: monthSalesData } = await supabase
    .from("sales")
    .select("total, fee_amount")
    .gte("created_at", monthStart)
    .lte("created_at", new Date().toISOString())
    .eq("status", "completed");
  const monthSales = (monthSalesData ?? []) as {
    total: number;
    fee_amount: number;
  }[];
  const monthSoFarNet =
    Math.round(
      monthSales.reduce((s, r) => s + (Number(r.total) - Number(r.fee_amount)), 0) *
        100,
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
          <form action={toggleSaleStatus}>
            <input type="hidden" name="id" value={sale.id} />
            <input type="hidden" name="currentStatus" value={sale.status} />
            <button
              type="submit"
              className={
                voided
                  ? "h-12 w-full rounded-lg bg-success px-5 text-base font-medium text-success-foreground hover:opacity-90"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20 h-12 w-full rounded-lg px-5 text-base font-medium"
              }
            >
              {voided ? "Reativar" : "Estornar"}
            </button>
          </form>
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
