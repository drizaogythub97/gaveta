import { describe, expect, it } from "vitest";

import { signupSchema } from "@/lib/validations/auth";
import { checkPasswordStrength } from "@/lib/validations/password";

describe("checkPasswordStrength", () => {
  it("rejeita senhas muito comuns", () => {
    expect(checkPasswordStrength("12345678")).not.toBeNull();
    expect(checkPasswordStrength("senha123")).not.toBeNull();
    expect(checkPasswordStrength("PASSWORD")).not.toBeNull();
  });

  it("rejeita sequências óbvias", () => {
    expect(checkPasswordStrength("abcdefgh")).not.toBeNull();
    expect(checkPasswordStrength("87654321")).not.toBeNull();
  });

  it("rejeita baixa variedade de caracteres", () => {
    expect(checkPasswordStrength("aaaaaaaa")).not.toBeNull();
    expect(checkPasswordStrength("abab:abab")).not.toBeNull();
  });

  it("rejeita senha que contém o e-mail ou o nome", () => {
    expect(
      checkPasswordStrength("maria-cardoso7", { email: "maria@x.com" }),
    ).not.toBeNull();
    expect(
      checkPasswordStrength("joaosilva-2030", { name: "João Silva" }),
    ).not.toBeNull();
  });

  it("aceita senha razoável", () => {
    expect(checkPasswordStrength("Cafe-Quente-2030")).toBeNull();
    expect(checkPasswordStrength("girassol roxo 9")).toBeNull();
  });
});

describe("signupSchema — política de senha integrada", () => {
  const base = {
    fullName: "Maria Souza",
    email: "maria.souza@example.com",
    privacyAccepted: "on" as const,
  };

  it("rejeita senha fraca no cadastro", () => {
    const r = signupSchema.safeParse({ ...base, password: "12345678" });
    expect(r.success).toBe(false);
  });

  it("rejeita senha que contém o nome", () => {
    const r = signupSchema.safeParse({ ...base, password: "maria-souza-99" });
    expect(r.success).toBe(false);
  });

  it("aceita senha forte no cadastro", () => {
    const r = signupSchema.safeParse({ ...base, password: "Tarde-Azul-47" });
    expect(r.success).toBe(true);
  });
});
