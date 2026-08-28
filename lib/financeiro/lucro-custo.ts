import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fechamento Lucro × Custo (plano 08, seção 2 — fase G3).
 *
 * A pergunta do dono no fim do dia: do dinheiro que ENTROU, quanto precisa
 * ser guardado para repor a mercadoria vendida (custo) e quanto é lucro.
 *
 * A agregação pesada é da RPC `lucro_custo_summary` (banco). Aqui fica só a
 * aritmética de apresentação — separada de propósito, para ser testada sem
 * depender de banco.
 */

/** Linha crua devolvida pela RPC. */
export type LucroCustoRow = {
  recebido_vista: number;
  taxas: number;
  custo_vista: number;
  base_vista: number;
  base_coberta_vista: number;
  recebido_fiado: number;
  custo_fiado: number;
  base_fiado: number;
  base_coberta_fiado: number;
};

export const LUCRO_CUSTO_ZERO: LucroCustoRow = {
  recebido_vista: 0,
  taxas: 0,
  custo_vista: 0,
  base_vista: 0,
  base_coberta_vista: 0,
  recebido_fiado: 0,
  custo_fiado: 0,
  base_fiado: 0,
  base_coberta_fiado: 0,
};

export type Fechamento = {
  /** Recebido no caixa (à vista) no período. */
  recebidoVista: number;
  /** Recebido de vendas a prazo quitadas no período (base caixa). */
  recebidoFiado: number;
  /** Tudo que entrou. */
  recebido: number;
  /** Taxas de cartão — saem do lucro, nunca do custo. */
  taxas: number;
  /** Quanto guardar para repor a mercadoria vendida (CMV). */
  custo: number;
  /** Lucro bruto: recebido − taxas − custo. */
  lucro: number;
  /**
   * Fração do valor vendido cujo custo era conhecido (0 a 1). `null` quando
   * não houve venda no período — não há o que cobrir.
   */
  cobertura: number | null;
  /** Valor vendido sem custo conhecido: o que falta para a cobertura fechar. */
  valorSemCusto: number;
};

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Monta os números do fechamento a partir da linha da RPC.
 *
 * O item sem custo entra no recebido, mas NÃO no custo (decisão 5: sinaliza,
 * não chuta) — por isso o lucro fica otimista enquanto a cobertura não é
 * 100%, e a tela precisa dizer isso.
 */
export function calcularFechamento(row: LucroCustoRow): Fechamento {
  const recebidoVista = Number(row.recebido_vista);
  const recebidoFiado = Number(row.recebido_fiado);
  const recebido = centavos(recebidoVista + recebidoFiado);
  const taxas = Number(row.taxas);
  const custo = centavos(Number(row.custo_vista) + Number(row.custo_fiado));

  const base = centavos(Number(row.base_vista) + Number(row.base_fiado));
  const coberta = centavos(
    Number(row.base_coberta_vista) + Number(row.base_coberta_fiado),
  );

  return {
    recebidoVista: centavos(recebidoVista),
    recebidoFiado: centavos(recebidoFiado),
    recebido,
    taxas: centavos(taxas),
    custo,
    lucro: centavos(recebido - taxas - custo),
    cobertura: base > 0 ? coberta / base : null,
    valorSemCusto: centavos(Math.max(base - coberta, 0)),
  };
}

/** Produto vendido sem custo conhecido — a lista do "informar custo agora". */
export type ProdutoSemCusto = {
  /** Nulo em item avulso: não há produto cadastrado para corrigir. */
  productId: string | null;
  nome: string | null;
  valor: number;
};

export async function carregarFechamento(
  supabase: SupabaseClient,
  fromISO: string,
  toISO: string,
): Promise<{ fechamento: Fechamento; semCusto: ProdutoSemCusto[] }> {
  const [resumoRes, listaRes] = await Promise.all([
    supabase
      .rpc("lucro_custo_summary", {
        p_from: fromISO,
        p_to: toISO,
        p_methods: null,
      })
      .maybeSingle(),
    supabase.rpc("produtos_sem_custo", {
      p_from: fromISO,
      p_to: toISO,
      p_methods: null,
    }),
  ]);

  const fechamento = calcularFechamento(
    (resumoRes.data ?? LUCRO_CUSTO_ZERO) as LucroCustoRow,
  );

  const semCusto = (
    (listaRes.data ?? []) as {
      product_id: string | null;
      nome: string | null;
      valor: number;
    }[]
  ).map((linha) => ({
    productId: linha.product_id,
    nome: linha.nome,
    valor: Number(linha.valor),
  }));

  return { fechamento, semCusto };
}
