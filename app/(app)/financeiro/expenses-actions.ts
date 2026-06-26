"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { expenseSchema } from "@/lib/validations/expenses";

export type ExpenseActionResult = { ok: true } | { ok: false; error: string };

export async function addExpense(
  formData: FormData,
): Promise<ExpenseActionResult> {
  const parsed = expenseSchema.safeParse({
    incurred_on: formData.get("incurred_on"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.from("expenses").insert({
    user_id: user.id,
    incurred_on: parsed.data.incurred_on,
    category: parsed.data.category,
    amount: parsed.data.amount,
    description: parsed.data.description ?? null,
  });
  if (error) {
    return { ok: false, error: "Não foi possível salvar a despesa." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExpense(
  formData: FormData,
): Promise<ExpenseActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Despesa inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: "Não foi possível excluir a despesa." };
  }

  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}
