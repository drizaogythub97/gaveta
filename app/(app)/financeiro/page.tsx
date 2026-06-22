import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_LABELS,
  type Period,
  rangeForPeriod,
  toDateInputValue,
} from "@/lib/dashboard/dates";
import { formatBRL } from "@/lib/products/format";
import { PAYMENT_METHOD_LABELS, type SaleRow } from "@/lib/types/sales";
import type { PaymentMethod } from "@/app/(app)/caixa/actions";

import { toggleSaleStatus } from "./actions";
import { FinancialClient } from "./financial-client";

export const metadata = {
  title: "Financeiro",
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
  const periodParam = pickString(params.period);
  const period: Period =
    periodParam && VALID_PERIODS.has(periodParam as Period)
      ? (periodParam as Period)
      : "today";
  const fromParam = pickString(params.from);
  const toParam = pickString(params.to);
  const methods = parseMethods(params.methods);

  const { from, to } = rangeForPeriod(period, fromParam, toParam);

  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select(
      "id, total, status, payment_method, installments, fee_amount, created_at, sale_items(id, product_id, name_snapshot, unit_price, quantity, line_total)",
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
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Vendas registradas no período. Você pode estornar e reativar
          vendas a qualquer momento.
        </p>
      </header>

      <FinancialClient
        period={period}
        from={toDateInputValue(from)}
        to={toDateInputValue(to)}
        selectedMethods={methods}
      />

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
    </section>
  );
}

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
  const net = Math.round((Number(sale.total) - Number(sale.fee_amount)) * 100) /
    100;
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
        <form action={toggleSaleStatus}>
          <input type="hidden" name="id" value={sale.id} />
          <input type="hidden" name="currentStatus" value={sale.status} />
          <button
            type="submit"
            className={
              voided
                ? "h-12 rounded-lg bg-success px-5 text-base font-medium text-success-foreground hover:opacity-90"
                : "h-12 rounded-lg bg-destructive/10 px-5 text-base font-medium text-destructive hover:bg-destructive/20"
            }
          >
            {voided ? "Reativar" : "Estornar"}
          </button>
        </form>
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
