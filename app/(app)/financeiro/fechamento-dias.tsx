"use client";

import { ChevronDown, Package, TrendingUp } from "lucide-react";
import { useState } from "react";

import { formatDate, formatDateOnly } from "@/lib/dashboard/dates";
import type { FechamentoDia, VendaDoDia } from "@/lib/financeiro/lucro-custo";
import { formatBRL } from "@/lib/products/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/types/sales";
import { cn } from "@/lib/utils";

import { detalheDoDia } from "./fechamento-actions";

/**
 * O período, dia a dia — e cada dia abre nas vendas que o formaram.
 *
 * O resumo de cada dia vem pronto do servidor (RPC `fechamento_por_dia`,
 * com as mesmas regras do total do topo, então a soma fecha). As vendas de
 * um dia só são buscadas quando aquele dia é aberto.
 */

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });

/** Nome do dia sem passar a data pura por `new Date` (voltaria um dia). */
function nomeDoDia(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return DIA_DA_SEMANA.format(new Date(ano, mes - 1, d));
}

const HORA = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function FechamentoDias({
  dias,
  from,
  to,
}: {
  dias: FechamentoDia[];
  /** Bordas do período — o detalhe precisa do mesmo recorte do resumo. */
  from: string;
  to: string;
}) {
  if (dias.length === 0) return null;

  return (
    <section
      aria-labelledby="fechamento-dias"
      // A regressão visual mascara este bloco: ele mostra a data de HOJE, e
      // um baseline com data dentro quebraria sozinho amanhã. A cobertura da
      // seção fica no e2e funcional e nas checagens de a11y, que rodam sobre
      // a página inteira.
      data-testid="fechamento-dias"
      className="flex flex-col gap-3"
    >
      <h3 id="fechamento-dias" className="text-xl font-semibold">
        Dia a dia
      </h3>
      <p className="text-muted-foreground text-base">
        Toque em um dia para ver as vendas daquele dia, uma a uma, com o que
        foi custo e o que foi lucro.
      </p>
      <ul className="flex flex-col gap-2">
        {dias.map((dia) => (
          <li key={dia.dia}>
            <LinhaDoDia dia={dia} from={from} to={to} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LinhaDoDia({
  dia,
  from,
  to,
}: {
  dia: FechamentoDia;
  from: string;
  to: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [vendas, setVendas] = useState<VendaDoDia[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const painelId = `dia-${dia.dia}`;

  async function alternar() {
    const proximo = !aberto;
    setAberto(proximo);
    // Busca uma vez só: reabrir o mesmo dia não volta ao banco.
    if (!proximo || vendas !== null || carregando) return;

    setCarregando(true);
    setErro(null);
    const resultado = await detalheDoDia(dia.dia, from, to);
    setCarregando(false);
    if (resultado.ok) setVendas(resultado.vendas);
    else setErro(resultado.error);
  }

  const coberturaParcial = dia.cobertura !== null && dia.cobertura < 1;

  return (
    <div className="ring-foreground/10 bg-card rounded-xl ring-1">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls={painelId}
        className="hover:bg-muted/50 @container flex w-full flex-col gap-3 rounded-xl p-4 text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-5 shrink-0 transition-transform",
                aberto && "rotate-180",
              )}
            />
            <span className="flex flex-col">
              <span className="text-foreground text-lg font-semibold">
                {formatDateOnly(dia.dia)}
              </span>
              <span className="text-muted-foreground text-sm">
                {/* `capitalize` só no dia da semana: aplicado na frase
                    inteira, viraria "Domingo · 1 Venda". */}
                <span className="capitalize">{nomeDoDia(dia.dia)}</span> ·{" "}
                {dia.vendas === 1 ? "1 venda" : `${dia.vendas} vendas`}
                {dia.recebidoFiado > 0 ? " · recebimento a prazo" : ""}
              </span>
            </span>
          </span>
          <span className="text-foreground text-xl font-semibold tabular-nums">
            {formatBRL(dia.recebido)}
          </span>
        </div>

        {/* O mesmo par de números do topo da aba, na escala do dia. */}
        <div className="@xs:grid-cols-2 grid grid-cols-1 gap-2">
          <span className="border-warning/40 bg-warning/10 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-warning flex items-center gap-1.5 text-sm font-medium">
              <Package aria-hidden="true" className="size-4 shrink-0" />
              Repor
            </span>
            <span className="text-foreground text-base font-semibold tabular-nums">
              {formatBRL(dia.custo)}
            </span>
          </span>
          <span className="border-success/40 bg-success/10 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-success flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp aria-hidden="true" className="size-4 shrink-0" />
              Lucro
            </span>
            <span className="text-foreground text-base font-semibold tabular-nums">
              {formatBRL(dia.lucro)}
            </span>
          </span>
        </div>

        {coberturaParcial ? (
          <span className="text-warning text-sm">
            Só {Math.round((dia.cobertura ?? 0) * 100)}% do que foi vendido
            neste dia tem custo cadastrado — o lucro está por cima.
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div id={painelId} className="border-border border-t p-4">
          {carregando ? (
            <p role="status" className="text-muted-foreground text-base">
              Carregando as vendas do dia…
            </p>
          ) : erro ? (
            <p role="alert" className="text-destructive text-base">
              {erro}
            </p>
          ) : vendas && vendas.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {vendas.map((venda) => (
                <li key={venda.id}>
                  <CartaoDaVenda venda={venda} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-base">
              Nenhuma venda para detalhar neste dia.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CartaoDaVenda({ venda }: { venda: VendaDoDia }) {
  const ehFiado = venda.origem === "fiado";
  const rotuloMetodo =
    PAYMENT_METHOD_LABELS[venda.metodo as keyof typeof PAYMENT_METHOD_LABELS] ??
    venda.metodo;

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {ehFiado ? (
            // `formatDate` (e não fatiar o ISO): a data da venda original é
            // um instante, e cortar a string devolveria o dia em UTC.
            <>Recebido de venda a prazo de {formatDate(venda.vendidaEm)}</>
          ) : (
            <>
              {HORA.format(new Date(venda.vendidaEm))} · {rotuloMetodo}
            </>
          )}
        </span>
        <span className="text-foreground text-lg font-semibold tabular-nums">
          {formatBRL(venda.valor)}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {venda.itens.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-base"
          >
            <span className="text-foreground">
              {item.nome}{" "}
              <span className="text-muted-foreground">
                × {item.quantidade.toString().replace(".", ",")}
              </span>
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {formatBRL(item.valor)}
              {item.custo === null ? (
                <span className="text-warning"> · sem custo cadastrado</span>
              ) : (
                <>
                  {" "}
                  · custo {formatBRL(item.custo)} · lucro{" "}
                  {formatBRL(Math.round((item.valor - item.custo) * 100) / 100)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-border flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2 text-sm">
        <span className="text-muted-foreground">
          Repor:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {formatBRL(venda.custo)}
          </span>
        </span>
        {venda.taxa > 0 ? (
          <span className="text-muted-foreground">
            Taxa:{" "}
            <span className="text-foreground font-medium tabular-nums">
              {formatBRL(venda.taxa)}
            </span>
          </span>
        ) : null}
        <span className="text-muted-foreground">
          Lucro:{" "}
          <span className="text-success font-semibold tabular-nums">
            {formatBRL(venda.lucro)}
          </span>
          {venda.temItemSemCusto ? (
            <span className="text-warning"> (por cima)</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
