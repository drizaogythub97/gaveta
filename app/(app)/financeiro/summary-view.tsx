import { formatBRL } from "@/lib/products/format";
import { formatDateTime } from "@/lib/dashboard/dates";
import type { CashSession } from "@/lib/types/cash";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "@/lib/types/expenses";
import { cn } from "@/lib/utils";

export type SummaryData = {
  grossRevenue: number;
  feesTotal: number;
  netRevenue: number;
  /** Recebido de vendas a prazo (FiadoApp) no período — income realizado. */
  recebidoFiado: number;
  expensesByCategory: { category: ExpenseCategory; total: number }[];
  expensesTotal: number;
  result: number;
  closedSessions: CashSession[];
  projection: {
    monthSoFarNet: number;
    dailyAvg: number;
    daysRemaining: number;
    projectedMonthNet: number;
  } | null;
};

function Card({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-5",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "good" && "bg-success/10 text-success",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "default" && "ring-foreground/10 bg-card ring-1",
      )}
    >
      <p className="text-sm opacity-90">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function SummaryView({ data }: { data: SummaryData }) {
  const resultPositive = data.result >= 0;
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Receita bruta" value={formatBRL(data.grossRevenue)} />
        <Card label="Taxas de pagamento" value={`− ${formatBRL(data.feesTotal)}`} />
        <Card label="Receita líquida" value={formatBRL(data.netRevenue)} />
        {data.recebidoFiado > 0 ? (
          <Card
            label="Recebido a prazo (FiadoApp)"
            value={formatBRL(data.recebidoFiado)}
          />
        ) : null}
        <Card label="Despesas" value={`− ${formatBRL(data.expensesTotal)}`} />
        <Card
          label={
            data.recebidoFiado > 0
              ? "Resultado (líquida + a prazo − despesas)"
              : "Resultado (líquida − despesas)"
          }
          value={formatBRL(data.result)}
          tone={resultPositive ? "good" : "bad"}
        />
      </section>

      <section className="ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
        <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Despesas por categoria</h2>
        {data.expensesByCategory.length === 0 ? (
          <p className="text-muted-foreground text-base">
            Nenhuma despesa no período.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.expensesByCategory.map((row) => (
              <li
                key={row.category}
                className="flex items-center justify-between gap-3 text-base"
              >
                <span className="text-foreground">
                  {EXPENSE_CATEGORY_LABELS[row.category]}
                </span>
                <span className="text-foreground font-medium tabular-nums">
                  {formatBRL(row.total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
        <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Fechamentos de caixa no período</h2>
        {data.closedSessions.length === 0 ? (
          <p className="text-muted-foreground text-base">
            Nenhum caixa fechado no período.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.closedSessions.map((s) => {
              const diff = Number(s.difference_amount ?? 0);
              const exact = Math.abs(diff) < 0.005;
              return (
                <li
                  key={s.id}
                  className="border-border flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-muted-foreground text-sm">
                    {s.closed_at ? formatDateTime(s.closed_at) : "—"} · Esperado{" "}
                    {formatBRL(Number(s.expected_amount ?? 0))} · Contado{" "}
                    {formatBRL(Number(s.counted_amount ?? 0))}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium",
                      exact
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {exact
                      ? "Sem diferença"
                      : `${diff > 0 ? "Sobra" : "Falta"} ${formatBRL(Math.abs(diff))}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.projection ? (
        <section className="ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Projeção do mês</h2>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              estimativa
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Baseada na média diária de receita líquida do mês atual ×{" "}
            {data.projection.daysRemaining} dia(s) restante(s). É só uma
            estimativa, não uma garantia.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card
              label="Líquido no mês até agora"
              value={formatBRL(data.projection.monthSoFarNet)}
            />
            <Card
              label="Média por dia"
              value={formatBRL(data.projection.dailyAvg)}
            />
            <Card
              label="Projeção p/ fim do mês"
              value={formatBRL(data.projection.projectedMonthNet)}
              tone="primary"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
