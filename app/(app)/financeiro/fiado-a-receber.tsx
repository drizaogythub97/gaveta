import { ArrowUpRight } from "lucide-react";

import { FiadoappBadge } from "@/components/app/fiadoapp-badge";
import { FIADOAPP_URL } from "@/lib/ecossistema";
import type { FiadoAReceber } from "@/lib/financeiro/fiado";
import { formatBRL } from "@/lib/products/format";

import { FiadoAReceberDeleteButton } from "./fiado-receber-actions-button";

function formatVencimento(iso: string | null): string {
  if (!iso) return "Sem vencimento";
  const [y, m, d] = iso.split("-");
  return `Vence em ${d}/${m}/${y}`;
}

/**
 * Bloco "A receber via FiadoApp" (Ecossistema F6, Fase 2): as vendas a prazo
 * lançadas no caixa que ainda estão em aberto no FiadoApp. SEGREGADO do
 * faturamento — é dinheiro a receber, não realizado. Cada linha leva ao
 * detalhe da venda no FiadoApp (nova aba). Snapshot ao vivo (não é do
 * período).
 */
export function FiadoAReceberBlock({ vendas }: { vendas: FiadoAReceber[] }) {
  if (vendas.length === 0) return null;

  const totalAReceber =
    Math.round(vendas.reduce((s, v) => s + v.falta, 0) * 100) / 100;

  return (
    <section
      aria-labelledby="fiado-receber-heading"
      className="border-red-200 bg-red-50/60 flex flex-col gap-3 rounded-xl border p-5 dark:border-red-500/20 dark:bg-red-500/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="fiado-receber-heading"
          className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold"
        >
          A receber via FiadoApp
          <FiadoappBadge rotulo="FiadoApp" />
        </h2>
        <span className="text-base font-semibold tabular-nums">
          {formatBRL(totalAReceber)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        Vendas a prazo do caixa ainda em aberto. Não contam no faturamento — o
        valor entra quando for pago no FiadoApp.
      </p>
      <ul className="flex flex-col gap-2">
        {vendas.map((v) => (
          <li
            key={v.id}
            className="bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-base font-medium">
                {v.cliente}
              </span>
              <span className="text-muted-foreground text-sm">
                {formatVencimento(v.dataVencimento)}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-base font-semibold tabular-nums whitespace-nowrap">
                {formatBRL(v.falta)}
                {v.status === "PARCIAL" ? (
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    de {formatBRL(v.valorTotal)}
                  </span>
                ) : null}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={`${FIADOAPP_URL}/vendas/${v.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                >
                  Ver no FiadoApp
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
                <FiadoAReceberDeleteButton
                  vendaId={v.id}
                  cliente={v.cliente}
                  temPagamento={v.valorPago > 0}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
