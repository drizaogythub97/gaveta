"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { parseDecimalPtBR } from "@/lib/products/format";
import { THEME_COOKIE, type Theme } from "@/lib/theme/cookie";
import { receiptPrefsSchema } from "@/lib/validations/receipt";

const ONE_YEAR = 60 * 60 * 24 * 365;
const MAX_LOGO_BYTES = 1_500_000; // ~1,5 MB depois de cropado/reencoded

type AcceptedKind = "webp" | "png" | "jpeg";

function detectImageKind(bytes: Uint8Array): AcceptedKind | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // WebP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

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

export async function removeBrandName(): Promise<BrandFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("profiles")
    .update({ brand_name: null })
    .eq("id", user.id);

  if (error) return { error: "Não foi possível remover." };
  revalidatePath("/", "layout");
  revalidatePath("/preferencias");
  return { ok: true };
}

export type LogoUploadResult = { ok: boolean; error?: string; path?: string };

export async function uploadBrandLogo(
  formData: FormData,
): Promise<LogoUploadResult> {
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { ok: false, error: "Arquivo não enviado." };
  }
  if (file.size === 0) {
    return { ok: false, error: "Arquivo vazio." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Imagem maior que 1,5 MB." };
  }
  // Aceita só MIME esperado (declarado pelo browser). Re-checamos magic bytes abaixo.
  if (!["image/webp", "image/png", "image/jpeg"].includes(file.type)) {
    return { ok: false, error: "Use uma imagem PNG, JPEG ou WebP." };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = detectImageKind(buffer);
  if (!kind) {
    return {
      ok: false,
      error: "Arquivo não é uma imagem válida (PNG / JPEG / WebP).",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  const ext = kind === "jpeg" ? "jpg" : kind;
  const key = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("brand-logos")
    .upload(key, buffer, {
      contentType: `image/${kind}`,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: "Não foi possível enviar a imagem." };
  }

  const { data: previousProfile } = await supabase
    .from("profiles")
    .select("brand_logo_path")
    .eq("id", user.id)
    .maybeSingle();
  const previousPath = previousProfile?.brand_logo_path as string | null;

  const { error: updError } = await supabase
    .from("profiles")
    .update({ brand_logo_path: key })
    .eq("id", user.id);

  if (updError) {
    await supabase.storage.from("brand-logos").remove([key]);
    return { ok: false, error: "Não foi possível salvar a referência." };
  }

  if (previousPath && previousPath !== key) {
    await supabase.storage.from("brand-logos").remove([previousPath]);
  }

  revalidatePath("/", "layout");
  revalidatePath("/preferencias");
  return { ok: true, path: key };
}

export async function removeBrandLogo(): Promise<LogoUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("brand_logo_path")
    .eq("id", user.id)
    .maybeSingle();
  const path = profile?.brand_logo_path as string | null;
  if (!path) return { ok: true };

  await supabase.storage.from("brand-logos").remove([path]);
  await supabase
    .from("profiles")
    .update({ brand_logo_path: null })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  revalidatePath("/preferencias");
  return { ok: true };
}

export type ReceiptFormState = {
  ok?: boolean;
  error?: string;
};

export async function saveReceiptPrefs(
  _prev: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const parsed = receiptPrefsSchema.safeParse({
    paper: formData.get("paper"),
    show_logo: formData.get("show_logo") === "on",
    show_name: formData.get("show_name") === "on",
    footer: String(formData.get("footer") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const footer = parsed.data.footer?.trim();
  const { error } = await supabase
    .from("profiles")
    .update({
      receipt_paper: parsed.data.paper,
      receipt_show_logo: parsed.data.show_logo,
      receipt_show_name: parsed.data.show_name,
      receipt_footer: footer && footer.length > 0 ? footer : null,
    })
    .eq("id", user.id);

  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/preferencias");
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
