import { z } from "zod";

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  checkPasswordStrength,
} from "./password";

const email = z.email("Digite um e-mail válido.");

const password = z
  .string()
  .min(PASSWORD_MIN, `A senha deve ter ao menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, "A senha é muito longa.");

const fullName = z
  .string()
  .min(2, "Informe seu nome completo.")
  .max(120, "Nome muito longo.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha."),
});

export const signupSchema = z
  .object({
    fullName,
    email,
    password,
    privacyAccepted: z.literal("on", {
      error: "Você precisa aceitar a Política de Privacidade.",
    }),
  })
  .superRefine((data, ctx) => {
    if (data.password.length < PASSWORD_MIN) return;
    const issue = checkPasswordStrength(data.password, {
      email: data.email,
      name: data.fullName,
    });
    if (issue) {
      ctx.addIssue({ code: "custom", path: ["password"], message: issue });
    }
  });

export const recoverSchema = z.object({
  email,
});

export const resetSchema = z
  .object({
    password,
    passwordConfirm: z.string().min(1, "Confirme a nova senha."),
  })
  .superRefine((data, ctx) => {
    if (data.password.length >= PASSWORD_MIN) {
      const issue = checkPasswordStrength(data.password);
      if (issue) {
        ctx.addIssue({ code: "custom", path: ["password"], message: issue });
      }
    }
    if (data.password !== data.passwordConfirm) {
      ctx.addIssue({
        code: "custom",
        path: ["passwordConfirm"],
        message: "As senhas não coincidem.",
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
