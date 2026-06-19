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
  await supabase
    .from("sales")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}
