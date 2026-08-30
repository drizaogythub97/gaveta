"use server";

import { z } from "zod";

import { periodTimeZone } from "@/lib/dashboard/dates";
import {
  carregarVendasDoDia,
  type VendaDoDia,
} from "@/lib/financeiro/lucro-custo";
import { createClient } from "@/lib/supabase/server";

/**
 * Detalhe de um dia do fechamento, carregado ao abrir o dia na tela.
 *
 * É sob demanda de propósito: num período de 30 dias, trazer todas as
 * vendas de todos os dias de uma vez seria pesado e quase sempre em vão.
 */

const schema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dia inválido."),
  from: z.string().min(1),
  to: z.string().min(1),
});

export type DetalheDoDia =
  | { ok: true; vendas: VendaDoDia[] }
  | { ok: false; error: string };

export async function detalheDoDia(
  dia: string,
  from: string,
  to: string,
): Promise<DetalheDoDia> {
  const parsed = schema.safeParse({ dia, from, to });
  if (!parsed.success) {
    return { ok: false, error: "Não foi possível abrir este dia." };
  }
  // As datas só delimitam o que já é do próprio usuário: a RPC roda como
  // `security invoker`, então a RLS continua sendo a fronteira.
  if (
    Number.isNaN(Date.parse(parsed.data.from)) ||
    Number.isNaN(Date.parse(parsed.data.to))
  ) {
    return { ok: false, error: "Não foi possível abrir este dia." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  try {
    const vendas = await carregarVendasDoDia(
      supabase,
      parsed.data.dia,
      parsed.data.from,
      parsed.data.to,
      periodTimeZone(),
    );
    return { ok: true, vendas };
  } catch {
    // Erro não tratado em Server Action derruba a página inteira; aqui a
    // falha fica contida no dia que a pessoa abriu.
    return { ok: false, error: "Não foi possível carregar as vendas do dia." };
  }
}
