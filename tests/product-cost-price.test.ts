import { describe, expect, it } from "vitest";

import { productSchema } from "@/lib/validations/products";

/**
 * Fundação de custo (plano 08, fase G1): o preço de custo é OPCIONAL.
 * Vazio significa "custo não informado" (null no banco) — nunca zero, porque
 * quem não sabe o custo também não pode ter o lucro calculado.
 */
const base = {
  name: "Arroz 5kg",
  barcodes: ["7891234567890"],
  price: "25,90",
  trackStock: "true" as const,
  stockQuantity: "10",
};

describe("productSchema — preço de custo", () => {
  it("aceita o produto sem preço de custo (campo ausente)", () => {
    const parsed = productSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.costPrice).toBeNull();
  });

  it("trata campo vazio ou só com espaços como custo não informado", () => {
    for (const costPrice of ["", "   "]) {
      const parsed = productSchema.safeParse({ ...base, costPrice });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.costPrice).toBeNull();
    }
  });

  it("aceita custo em formato pt-BR e em decimal com ponto", () => {
    const virgula = productSchema.safeParse({ ...base, costPrice: "18,50" });
    expect(virgula.success && virgula.data.costPrice).toBe(18.5);

    const ponto = productSchema.safeParse({ ...base, costPrice: "18.50" });
    expect(ponto.success && ponto.data.costPrice).toBe(18.5);

    const milhar = productSchema.safeParse({ ...base, costPrice: "1.234,56" });
    expect(milhar.success && milhar.data.costPrice).toBe(1234.56);
  });

  it("arredonda para centavos", () => {
    const parsed = productSchema.safeParse({ ...base, costPrice: "10,999" });
    expect(parsed.success && parsed.data.costPrice).toBe(11);
  });

  it("recusa custo negativo (defesa do servidor)", () => {
    const parsed = productSchema.safeParse({ ...base, costPrice: "-1" });
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some(
          (i) => i.path[0] === "costPrice" && /negativo/.test(i.message),
        ),
    ).toBe(true);
  });

  it("recusa custo com texto inválido", () => {
    const parsed = productSchema.safeParse({ ...base, costPrice: "dez reais" });
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some((i) => i.path[0] === "costPrice"),
    ).toBe(true);
  });
});
