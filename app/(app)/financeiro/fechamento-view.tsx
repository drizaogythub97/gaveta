import { AlertTriangle, CheckCircle2, Package, TrendingUp } from "lucide-react";
import Link from "next/link";

import { formatBRL } from "@/lib/products/format";
import type {
  Fechamento,
  FechamentoDia,
  ProdutoSemCusto,
} from "@/lib/financeiro/lucro-custo";

import { FechamentoDias } from "./fechamento-dias";

/**
 * A tela "Fechamento do dia" (plano 08, §2.3).
 *
 * Responde em duas linhas grandes o que o dono quer saber: quanto separar
 * para repor a mercadoria e quanto sobrou de lucro. Linguagem direta, sem
 * jargão contábil — "CMV" e "margem bruta" não aparecem em lugar nenhum.
 */
export function FechamentoView({
  fechamento,
  semCusto,
  despesasSemCompras,
  periodo,
  dias,
  from,
  to,
}: {
  fechamento: Fechamento;
  semCusto: ProdutoSemCusto[];
  /** Despesas do período SEM as compras de mercadoria (ver nota abaixo). */
  despesasSemCompras: number;
  periodo: string;
  /** O período quebrado por dia — a soma bate com os números acima. */
  dias: FechamentoDia[];
  from: string;
  to: string;
}) {
  const { recebido, recebidoVista, recebidoFiado, taxas, custo, lucro } =
    fechamento;
  const cobertura = fechamento.cobertura;
  const coberturaPercentual =
    cobertura === null ? null : Math.round(cobertura * 100);
  const tudoCoberto = coberturaPercentual === 100;

  if (recebido === 0 && custo === 0) {
    return (
      <div className="bg-muted/40 minimal:max-sm:p-6 rounded-xl p-8 text-center">
        <p className="text-base">
          Nada entrou neste período. Quando houver venda, aqui aparece quanto
          guardar para repor a mercadoria e quanto é lucro.
        </p>
      </div>
    );
  }

  return (
    <div className="minimal:max-sm:gap-4 flex flex-col gap-6">
      {/* ---------- Quanto entrou ----------
          Cada bloco é uma região com nome: além de dar navegação decente no
          leitor de tela, é por esse nome que o valor é encontrado. */}
      <section
        aria-labelledby="fechamento-entrou"
        className="bg-primary text-primary-foreground flex flex-col gap-3 rounded-xl p-5"
      >
        <h3 id="fechamento-entrou" className="text-base font-normal opacity-90">
          Entrou — {periodo}
        </h3>
        <p
          className="minimal:max-sm:text-3xl text-4xl font-bold tabular-nums sm:text-5xl"
          aria-live="polite"
        >
          {formatBRL(recebido)}
        </p>
        {recebidoFiado > 0 ? (
          <p className="text-base opacity-90">
            {formatBRL(recebidoVista)} no caixa · {formatBRL(recebidoFiado)}{" "}
            recebido de vendas a prazo
          </p>
        ) : null}
      </section>

      {/* ---------- O split: recompra × lucro ---------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-labelledby="fechamento-custo"
          className="border-warning/40 bg-warning/10 minimal:max-sm:p-4 flex flex-col gap-2 rounded-xl border p-5"
        >
          <h3
            id="fechamento-custo"
            className="text-warning flex items-center gap-2 text-base font-medium"
          >
            <Package aria-hidden="true" className="size-5" />
            Guardar para repor a mercadoria
          </h3>
          <p className="text-foreground minimal:max-sm:text-2xl text-3xl font-bold tabular-nums">
            {formatBRL(custo)}
          </p>
          <p className="text-muted-foreground text-sm">
            É o que você pagou pelo que foi vendido. Separe este valor para
            comprar de novo.
          </p>
        </section>

        <section
          aria-labelledby="fechamento-lucro"
          className="border-success/40 bg-success/10 minimal:max-sm:p-4 flex flex-col gap-2 rounded-xl border p-5"
        >
          <h3
            id="fechamento-lucro"
            className="text-success flex items-center gap-2 text-base font-medium"
          >
            <TrendingUp aria-hidden="true" className="size-5" />
            Lucro
          </h3>
          <p className="text-foreground minimal:max-sm:text-2xl text-3xl font-bold tabular-nums">
            {formatBRL(lucro)}
          </p>
          <p className="text-muted-foreground text-sm">
            O que sobrou depois do custo
            {taxas > 0 ? (
              <> e de {formatBRL(taxas)} de taxas de cartão</>
            ) : null}
            .
          </p>
        </section>
      </div>

      {/* ---------- Cobertura de custo ---------- */}
      {coberturaPercentual === null ? null : tudoCoberto ? (
        <p className="text-success flex items-center gap-2 text-base">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          Todos os produtos vendidos têm o custo cadastrado — as contas acima
          estão completas.
        </p>
      ) : (
        <section
          aria-labelledby="fechamento-cobertura"
          className="border-warning/40 bg-warning/10 minimal:max-sm:p-4 flex flex-col gap-3 rounded-xl border p-5"
        >
          <h3
            id="fechamento-cobertura"
            className="text-warning flex items-center gap-2 text-base font-semibold"
          >
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />O
            lucro acima está por cima
          </h3>
          <p className="text-foreground text-base">
            Só <strong>{coberturaPercentual}%</strong> do que você vendeu tem o
            custo cadastrado. Faltam {formatBRL(fechamento.valorSemCusto)} em
            produtos sem custo — enquanto isso, parte do que aparece como lucro
            ainda é dinheiro de recompra.
          </p>
          <ul className="flex flex-col gap-2">
            {semCusto.map((item) => (
              <li
                key={item.productId ?? "avulsos"}
                className="bg-card ring-foreground/10 flex flex-col gap-2 rounded-lg p-3 ring-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-foreground text-base">
                  {item.nome ?? "Itens avulsos (sem produto cadastrado)"}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    · {formatBRL(item.valor)}
                  </span>
                </span>
                {item.productId ? (
                  <Link
                    href={`/produtos/${item.productId}/editar`}
                    className="border-border text-foreground hover:bg-muted flex h-11 items-center justify-center rounded-lg border px-4 text-base font-medium"
                  >
                    Informar custo
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    Item digitado na hora — não há produto para corrigir.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <FechamentoDias dias={dias} from={from} to={to} />

      {/* ---------- Linha informativa: as outras despesas ---------- */}
      <section className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-2 rounded-xl p-5 ring-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-medium">
            Lucro depois das outras despesas
          </span>
          <span className="minimal:max-sm:text-lg text-xl font-semibold tabular-nums">
            {formatBRL(Math.round((lucro - despesasSemCompras) * 100) / 100)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {despesasSemCompras > 0 ? (
            <>
              Descontando {formatBRL(despesasSemCompras)} de despesas do período
              (aluguel, contas, etc.).{" "}
            </>
          ) : (
            <>Nenhuma outra despesa lançada no período. </>
          )}
          As compras de mercadoria ficam de fora desta conta: esse dinheiro já é
          a recompra que você separou acima.
        </p>
      </section>
    </div>
  );
}
