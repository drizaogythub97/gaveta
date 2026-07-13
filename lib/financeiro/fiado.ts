import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leituras do FiadoApp para o financeiro do Gaveta (Ecossistema F6, Fase 2).
 * Base caixa: uma venda a prazo é A RECEBER, nunca faturamento no ato. O
 * dinheiro só entra no faturamento quando é pago no FiadoApp (por pagamento,
 * na data do pagamento). `fiado_vendas` é a fonte da verdade — o Gaveta
 * apenas PROJETA em tempo de leitura (mesma conta, RLS por user_id).
 */

/** Uma venda a prazo (origem Gaveta) ainda em aberto — snapshot do que falta. */
export type FiadoAReceber = {
  id: string;
  valorTotal: number;
  valorPago: number;
  falta: number;
  dataVencimento: string | null;
  status: string;
  cliente: string;
};

type FiadoVendaRow = {
  id: string;
  valor_total: number;
  valor_pago: number;
  data_vencimento: string | null;
  status: string;
  fiado_clientes: {
    nome: string;
    sobrenome: string | null;
    referencia: string | null;
  } | null;
};

function nomeCliente(c: FiadoVendaRow["fiado_clientes"]): string {
  if (!c) return "Cliente";
  const base = c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome;
  return c.referencia ? `${base} (${c.referencia})` : base;
}

/**
 * Vendas a prazo lançadas no PDV (origem = 'gaveta') ainda em aberto — o
 * bloco "A receber via FiadoApp". Snapshot ao vivo (não filtra por período:
 * é o que o cliente ainda deve, agora).
 */
export async function listarAReceberViaFiado(
  supabase: SupabaseClient,
): Promise<FiadoAReceber[]> {
  const { data } = await supabase
    .from("fiado_vendas")
    .select(
      "id, valor_total, valor_pago, data_vencimento, status, fiado_clientes(nome, sobrenome, referencia)",
    )
    .eq("origem", "gaveta")
    .neq("status", "PAGA")
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  return ((data ?? []) as unknown as FiadoVendaRow[]).map((v) => {
    const valorTotal = Number(v.valor_total);
    const valorPago = Number(v.valor_pago);
    return {
      id: v.id,
      valorTotal,
      valorPago,
      falta: Math.round((valorTotal - valorPago) * 100) / 100,
      dataVencimento: v.data_vencimento,
      status: v.status,
      cliente: nomeCliente(v.fiado_clientes),
    };
  });
}

/**
 * Valor de vendas a prazo (origem Gaveta) REALMENTE recebido no período,
 * pela data do pagamento (`pago_em`). É o que entra no faturamento do
 * Gaveta — parcial conta o que já foi pago. Soma os pagamentos reais.
 */
export async function recebidoViaFiadoNoPeriodo(
  supabase: SupabaseClient,
  fromISO: string,
  toISO: string,
): Promise<number> {
  const { data } = await supabase
    .from("fiado_pagamentos")
    .select("valor_pago, fiado_vendas!inner(origem)")
    .eq("fiado_vendas.origem", "gaveta")
    .gte("pago_em", fromISO)
    .lte("pago_em", toISO);

  const total = ((data ?? []) as { valor_pago: number }[]).reduce(
    (soma, p) => soma + Number(p.valor_pago),
    0,
  );
  return Math.round(total * 100) / 100;
}
