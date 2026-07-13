"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { SaleItemInput } from "@/lib/types/db";

/** Cliente do FiadoApp exposto ao combobox do caixa (só leitura). */
export type FiadoCliente = {
  id: string;
  nome: string;
  sobrenome: string | null;
  referencia: string | null;
  telefone: string | null;
};

const SEARCH_LIMIT = 50;
const COLS = "id, nome, sobrenome, referencia, telefone";

/**
 * Busca clientes do FiadoApp da PRÓPRIA conta (mesma conta via SSO; RLS por
 * user_id em fiado_clientes). Termo vazio = todos (limitado). Só leitura —
 * o caderno segue nativo do FiadoApp; o caixa apenas o consulta.
 */
export async function searchFiadoClientes(
  query: string,
): Promise<FiadoCliente[]> {
  const term = query.trim();
  const supabase = await createClient();
  let q = supabase
    .from("fiado_clientes")
    .select(COLS)
    .order("nome", { ascending: true })
    .limit(SEARCH_LIMIT);
  if (term.length > 0) q = q.ilike("nome", `%${term}%`);
  const { data } = await q;
  return (data ?? []) as FiadoCliente[];
}

const novoClienteSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  sobrenome: z.string().trim().max(80, "Sobrenome muito longo.").optional(),
  referencia: z
    .string()
    .trim()
    .max(80, "Referência muito longa.")
    .optional(),
  telefone: z
    .string()
    .trim()
    .max(20, "Telefone muito longo.")
    .optional(),
});

export type CriarFiadoClienteResult =
  | { ok: true; cliente: FiadoCliente }
  | { ok: false; error: string };

/**
 * Cadastra um cliente novo do FiadoApp direto do caixa (opção "Cadastrar
 * Novo Cliente" do bloco de venda a prazo). Insere em fiado_clientes (RLS
 * por user_id). Retorna o cliente para seleção automática.
 */
export async function criarFiadoCliente(
  input: unknown,
): Promise<CriarFiadoClienteResult> {
  const parsed = novoClienteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados do cliente inválidos.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { nome, sobrenome, referencia, telefone } = parsed.data;
  const { data, error } = await supabase
    .from("fiado_clientes")
    .insert({
      user_id: user.id,
      nome,
      sobrenome: sobrenome || null,
      referencia: referencia || null,
      telefone: telefone || null,
    })
    .select(COLS)
    .single();

  if (error || !data) {
    return { ok: false, error: "Não foi possível cadastrar o cliente." };
  }
  return { ok: true, cliente: data as FiadoCliente };
}

/** Quantidade fracionada vira parte da descrição ("1,5 × Tomate"). */
function descricaoItem(name: string, quantity: number): string {
  if (quantity === 1) return name;
  const qtd = (Math.round(quantity * 1000) / 1000).toString().replace(".", ",");
  return `${qtd} × ${name}`;
}

export type RegistrarVendaFiadoResult =
  | { ok: true; saleId: string; vendaId: string }
  | { ok: false; error: string };

/**
 * Registra uma venda "a prazo" no PDV: a RPC-ponte cria, numa única
 * transação, o a-receber no FiadoApp e a venda no Gaveta (com baixa de
 * estoque), atomicamente. Cliente existente (clienteId) OU novo inline.
 * Preserva o VALOR de itens fracionados embutindo a quantidade na descrição
 * do item do FiadoApp (decisão do dono, F6 Fase 1).
 */
export async function registrarVendaFiado(
  items: SaleItemInput[],
  clienteId: string | null,
  clienteNovo: { nome: string; sobrenome?: string; referencia?: string; telefone?: string } | null,
): Promise<RegistrarVendaFiadoResult> {
  if (items.length === 0) {
    return { ok: false, error: "Adicione ao menos um item à venda." };
  }
  if ((clienteId === null) === (clienteNovo === null)) {
    return { ok: false, error: "Escolha um cliente ou cadastre um novo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const pItems = items.map((it) => ({
    product_id: it.product_id,
    name: it.name,
    unit_price: it.unit_price,
    quantity: it.quantity,
  }));
  const pItensFiado = items.map((it) => ({
    descricao: descricaoItem(it.name, it.quantity),
    quantidade: 1,
    valor_unitario: Math.round(it.unit_price * it.quantity * 100) / 100,
  }));

  const { data, error } = await supabase.rpc("registrar_venda_fiado", {
    p_items: pItems,
    p_itens_fiado: pItensFiado,
    p_cliente_id: clienteId,
    p_cliente: clienteNovo
      ? {
          nome: clienteNovo.nome,
          sobrenome: clienteNovo.sobrenome ?? null,
          referencia: clienteNovo.referencia ?? null,
          telefone: clienteNovo.telefone ?? null,
        }
      : null,
    p_data_vencimento: null,
    p_observacao: null,
  });

  if (error || !data) {
    const msg = error?.message ?? "";
    return {
      ok: false,
      error: msg.includes("desativada")
        ? "A venda a prazo está desativada. Ative em Ecossistema."
        : "Não foi possível registrar a venda a prazo. Tente novamente.",
    };
  }

  const result = data as { venda_id: string; sale_id: string };
  return { ok: true, saleId: result.sale_id, vendaId: result.venda_id };
}
