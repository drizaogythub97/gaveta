"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { toPortugueseAuthError } from "@/lib/auth/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  readThemeFromProfile,
} from "@/lib/theme/cookie";
import { loginSchema } from "@/lib/validations/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  email?: string;
};

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors, email: raw.email };
  }

  const rate = await checkRateLimit("login");
  if (!rate.ok) {
    return { error: rate.message, email: parsed.data.email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: toPortugueseAuthError(error.message),
      email: parsed.data.email,
    };
  }

  // O tema é da CONTA. Gravar o cookie aqui faz duas coisas: o aparelho novo
  // já entra com o tema certo, e um cookie deixado por OUTRA conta neste
  // mesmo aparelho é sobrescrito em vez de continuar valendo.
  const theme = (await readThemeFromProfile()) ?? "light";
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  redirect("/dashboard");
}
