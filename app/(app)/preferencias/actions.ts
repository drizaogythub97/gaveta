"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { parseDecimalPtBR } from "@/lib/products/format";
import { THEME_COOKIE, type Theme } from "@/lib/theme/cookie";

const ONE_YEAR = 60 * 60 * 24 * 365;

export type FeesFormState = {
  ok?: boolean;
  error?: string;
};

function pct(formData: FormData, key: string): number {
  const v = String(formData.get(key) ?? "").trim();
  if (v === "") return 0;
  const n = parseDecimalPtBR(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Valor inválido para ${key}`);
  }
  return Math.round(n * 100) / 100;
}

export async function saveTheme(theme: Theme): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ theme })
    .eq("id", user.id);

  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}

export async function toggleTheme(formData: FormData): Promise<void> {
  const next = String(formData.get("next") ?? "light");
  await saveTheme(next === "dark" ? "dark" : "light");
}

export type BrandFormState = {
  ok?: boolean;
  error?: string;
};

export async function saveBrandName(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const raw = String(formData.get("brand_name") ?? "").trim();
  if (raw.length > 60) {
    return { error: "Use até 60 caracteres." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("profiles")
    .update({ brand_name: raw.length === 0 ? null : raw })
    .eq("id", user.id);

  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveFees(
  _prev: FeesFormState,
  formData: FormData,
): Promise<FeesFormState> {
  let payload: {
    pix_pct: number;
    debito_pct: number;
    credito_avista_pct: number;
    credito_parcelado_base_pct: number;
    credito_parcelado_por_parcela_pct: number;
    vale_pct: number;
  };
  try {
    payload = {
      pix_pct: pct(formData, "pix_pct"),
      debito_pct: pct(formData, "debito_pct"),
      credito_avista_pct: pct(formData, "credito_avista_pct"),
      credito_parcelado_base_pct: pct(formData, "credito_parcelado_base_pct"),
      credito_parcelado_por_parcela_pct: pct(
        formData,
        "credito_parcelado_por_parcela_pct",
      ),
      vale_pct: pct(formData, "vale_pct"),
    };
  } catch {
    return { error: "Taxas devem ser números entre 0 e 100." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("preferences_fees")
    .upsert({ user_id: user.id, ...payload, updated_at: new Date().toISOString() });

  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/preferencias");
  revalidatePath("/caixa");
  revalidatePath("/financeiro");
  return { ok: true };
}
