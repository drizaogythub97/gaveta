"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Exclui uma venda a prazo pelo lado do Gaveta (bloco "A receber via
 * FiadoApp"). A RPC-ponte remove os DOIS lados atomicamente — a venda do
 * Gaveta (estornando o estoque) e a venda a prazo no FiadoApp — para que a
 * exclusão seja consistente entre os apps (F6 Fase 3).
 */
export async function excluirVendaAPrazo(
  vendaId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!vendaId) return { ok: false, error: "Venda inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.rpc("excluir_venda_fiado", {
    p_venda_id: vendaId,
  });
  if (error) {
    return {
      ok: false,
      error: "Não foi possível excluir a venda a prazo. Tente novamente.",
    };
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}
