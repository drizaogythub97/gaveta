"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ToggleSaleStatusResult = { ok: boolean; error?: string };

export async function toggleSaleStatus(
  id: string,
  currentStatus: string,
): Promise<ToggleSaleStatusResult> {
  if (!id || (currentStatus !== "completed" && currentStatus !== "voided")) {
    return { ok: false, error: "Venda inválida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const nextStatus = currentStatus === "completed" ? "voided" : "completed";
  // RPC transacional: inverte o status e, ao mesmo tempo, devolve (estorno)
  // ou rebaixa (reativação) o estoque dos itens que controlam quantidade,
  // registrando o movimento. Ignora produtos com track_stock = false.
  const { error } = await supabase.rpc("set_sale_status", {
    p_sale_id: id,
    p_status: nextStatus,
  });

  if (error) {
    return {
      ok: false,
      error:
        currentStatus === "completed"
          ? "Não foi possível estornar a venda. Tente novamente."
          : "Não foi possível reativar a venda. Tente novamente.",
    };
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/estoque");
  return { ok: true };
}
