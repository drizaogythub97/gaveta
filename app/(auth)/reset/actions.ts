"use server";

import { redirect } from "next/navigation";

import { toPortugueseAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { resetSchema } from "@/lib/validations/auth";

export type ResetState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "passwordConfirm", string>>;
};

export async function reset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const raw = {
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  };

  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ResetState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "password" || key === "passwordConfirm") {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Sua sessão de recuperação expirou. Solicite um novo link.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: toPortugueseAuthError(error.message) };
  }

  redirect("/dashboard");
}
