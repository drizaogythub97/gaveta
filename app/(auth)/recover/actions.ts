"use server";

import { publicEnv } from "@/lib/env";
import { toPortugueseAuthError } from "@/lib/auth/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { recoverSchema } from "@/lib/validations/auth";

export type RecoverState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"email", string>>;
  email?: string;
};

export async function recover(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
  };

  const parsed = recoverSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: RecoverState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email") fieldErrors[key] = issue.message;
    }
    return { fieldErrors, email: raw.email };
  }

  const rate = await checkRateLimit("recover");
  if (!rate.ok) {
    return { error: rate.message, email: parsed.data.email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset`,
    },
  );

  if (error) {
    return {
      error: toPortugueseAuthError(error.message),
      email: parsed.data.email,
    };
  }

  return {
    success:
      "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique sua caixa de entrada.",
  };
}
