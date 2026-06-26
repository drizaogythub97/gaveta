"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ToggleSaleStatusResult = { ok: boolean; error?: string };

export async function toggleSaleStatus(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const current = String(formData.get("currentStatus") ?? "");
  if (!id || (current !== "completed" && current !== "voided")) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const nextStatus = current === "completed" ? "voided" : "completed";
  // RPC transacional: inverte o status e, ao mesmo tempo, devolve (estorno)
  // ou rebaixa (reativação) o estoque dos itens que controlam quantidade,
  // registrando o movimento. Ignora produtos com track_stock = false.
  await supabase.rpc("set_sale_status", {
    p_sale_id: id,
    p_status: nextStatus,
  });

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/estoque");
}
