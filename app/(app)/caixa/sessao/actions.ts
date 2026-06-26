"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  cashMovementSchema,
  closeSessionSchema,
  openSessionSchema,
} from "@/lib/validations/cash";

export type CashActionResult = { ok: true } | { ok: false; error: string };

export type CloseSessionResult =
  | { ok: true; expected: number; counted: number; difference: number }
  | { ok: false; error: string };

function mapRpcError(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("não autenticado")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("já existe um caixa aberto")) return "Já existe um caixa aberto.";
  if (msg.includes("nenhum caixa aberto")) return "Nenhum caixa aberto.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

function revalidate() {
  revalidatePath("/caixa/sessao");
  revalidatePath("/caixa");
  revalidatePath("/financeiro");
}

export async function openSession(
  formData: FormData,
): Promise<CashActionResult> {
  const parsed = openSessionSchema.safeParse({
    opening: formData.get("opening"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.rpc("open_cash_session", {
    p_opening: parsed.data.opening,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error.message) };

  revalidate();
  return { ok: true };
}

export async function addCashMovement(
  formData: FormData,
): Promise<CashActionResult> {
  const parsed = cashMovementSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.rpc("add_cash_movement", {
    p_type: parsed.data.type,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error.message) };

  revalidate();
  return { ok: true };
}

export async function closeSession(
  formData: FormData,
): Promise<CloseSessionResult> {
  const parsed = closeSessionSchema.safeParse({
    counted: formData.get("counted"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const { data: sessionId, error } = await supabase.rpc("close_cash_session", {
    p_counted: parsed.data.counted,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error.message) };

  const { data: closed } = await supabase
    .from("cash_sessions")
    .select("expected_amount, counted_amount, difference_amount")
    .eq("id", sessionId as string)
    .maybeSingle();

  revalidate();
  return {
    ok: true,
    expected: Number(closed?.expected_amount ?? 0),
    counted: Number(closed?.counted_amount ?? 0),
    difference: Number(closed?.difference_amount ?? 0),
  };
}
