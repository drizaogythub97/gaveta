"use server";

import { createClient as createSbClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getServiceRoleKey, publicEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string };

const nameSchema = z
  .string()
  .trim()
  .min(2, "Informe seu nome (mínimo 2 caracteres).")
  .max(120, "Nome muito longo (máx. 120 caracteres).");

const emailSchema = z.email("Digite um e-mail válido.");

const passwordSchema = z
  .string()
  .min(8, "A nova senha deve ter ao menos 8 caracteres.")
  .max(72, "A nova senha é muito longa.");

// =====================================================================
// Atualizar nome
// =====================================================================

export async function updateName(fullName: string): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(fullName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  const [profileResult, authResult] = await Promise.all([
    supabase
      .from("profiles")
      .update({ full_name: parsed.data })
      .eq("id", user.id),
    supabase.auth.updateUser({ data: { full_name: parsed.data } }),
  ]);

  if (profileResult.error || authResult.error) {
    return { ok: false, error: "Não foi possível salvar." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// =====================================================================
// Helper: reautentica com a senha atual antes de permitir mudança sensível
// =====================================================================

async function reauthenticate(
  currentPassword: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!currentPassword || currentPassword.length === 0) {
    return { ok: false, error: "Informe sua senha atual." };
  }

  const rate = await checkRateLimit("reauth");
  if (!rate.ok) {
    return { ok: false, error: rate.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (error) {
    if (/rate limit|too many/i.test(error.message)) {
      return {
        ok: false,
        error: "Muitas tentativas. Aguarde alguns minutos.",
      };
    }
    return { ok: false, error: "Senha atual incorreta." };
  }

  return { ok: true, email: user.email };
}

// =====================================================================
// Trocar e-mail
// =====================================================================

export async function changeEmail(
  currentPassword: string,
  newEmail: string,
): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(newEmail.trim().toLowerCase());
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const auth = await reauthenticate(currentPassword);
  if (!auth.ok) return auth;

  if (parsed.data === auth.email.toLowerCase()) {
    return { ok: false, error: "O novo e-mail é igual ao atual." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/minha-conta` },
  );
  if (error) {
    if (/already (registered|exists)/i.test(error.message)) {
      return { ok: false, error: "Este e-mail já está em uso." };
    }
    if (/rate limit|too many/i.test(error.message)) {
      return {
        ok: false,
        error: "Muitas tentativas. Aguarde alguns minutos.",
      };
    }
    return { ok: false, error: "Não foi possível solicitar a troca." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// =====================================================================
// Trocar senha
// =====================================================================

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Senha inválida." };
  }
  if (currentPassword === parsed.data) {
    return { ok: false, error: "A nova senha deve ser diferente da atual." };
  }

  const auth = await reauthenticate(currentPassword);
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (/rate limit|too many/i.test(error.message)) {
      return {
        ok: false,
        error: "Muitas tentativas. Aguarde alguns minutos.",
      };
    }
    return { ok: false, error: "Não foi possível alterar a senha." };
  }

  return { ok: true };
}

// =====================================================================
// Excluir conta (já existia — mantido)
// =====================================================================

export type DeleteAccountResult = { ok: false; error: string };

export async function deleteAccount(
  password: string,
): Promise<DeleteAccountResult | void> {
  if (!password || password.length === 0) {
    return { ok: false, error: "Informe sua senha para confirmar." };
  }

  const rate = await checkRateLimit("reauth");
  if (!rate.ok) {
    return { ok: false, error: rate.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }
  const userId = user.id;
  const email = user.email;

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return { ok: false, error: "Senha incorreta." };
  }

  const { data: files } = await supabase.storage
    .from("brand-logos")
    .list(userId);
  if (files && files.length > 0) {
    await supabase.storage
      .from("brand-logos")
      .remove(files.map((f) => `${userId}/${f.name}`));
  }

  const admin = createSbClient(
    publicEnv.supabaseUrl,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return { ok: false, error: "Não foi possível excluir a conta agora." };
  }

  await supabase.auth.signOut();
  redirect("/");
}
