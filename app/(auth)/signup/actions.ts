"use server";

import { publicEnv } from "@/lib/env";
import { toPortugueseAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validations/auth";

export type SignupState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"fullName" | "email" | "password" | "privacyAccepted", string>
  >;
  values?: {
    fullName?: string;
    email?: string;
  };
};

export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    privacyAccepted: formData.get("privacyAccepted") ?? undefined,
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        key === "fullName" ||
        key === "email" ||
        key === "password" ||
        key === "privacyAccepted"
      ) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      fieldErrors,
      values: { fullName: raw.fullName, email: raw.email },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback`,
      data: {
        full_name: parsed.data.fullName,
        privacy_accepted: "true",
      },
    },
  });

  if (error) {
    return {
      error: toPortugueseAuthError(error.message),
      values: { fullName: parsed.data.fullName, email: parsed.data.email },
    };
  }

  if (data.session) {
    return {
      success:
        "Conta criada com sucesso! Você já pode entrar.",
    };
  }

  return {
    success:
      "Conta criada! Enviamos um e-mail de confirmação para " +
      parsed.data.email +
      ". Confirme antes de entrar.",
  };
}
