import { describe, expect, it } from "vitest";

import { productSchema } from "@/lib/validations/products";

/**
 * Validação das categorias de produto (migration 0019).
 *
 * A criação é ORGÂNICA — quem cadastra digita o nome —, então o servidor
 * precisa ser rígido com o que aceita: id que não é uuid, nome longo demais
 * e lista sem fim são exatamente o que chega quando alguém mexe no
 * formulário por fora.
 */

const BASE = {
  name: "Café",
  barcodes: [],
  price: "10,00",
  costPrice: "",
  trackStock: "false" as const,
  stockQuantity: "",
};

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("categorias no schema de produto", () => {
  it("aceita produto sem categoria nenhuma", () => {
    const r = productSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tagIds).toEqual([]);
      expect(r.data.newTags).toEqual([]);
    }
  });

  it("separa as existentes (id) das digitadas na hora (nome)", () => {
    const r = productSchema.safeParse({
      ...BASE,
      tagIds: [UUID_A, UUID_B],
      newTags: ["Bebidas"],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tagIds).toEqual([UUID_A, UUID_B]);
      expect(r.data.newTags).toEqual(["Bebidas"]);
    }
  });

  it("recusa id que não é uuid", () => {
    const r = productSchema.safeParse({ ...BASE, tagIds: ["nao-e-uuid"] });
    expect(r.success).toBe(false);
  });

  it("descarta id vazio e repetido", () => {
    const r = productSchema.safeParse({
      ...BASE,
      tagIds: ["", UUID_A, UUID_A],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tagIds).toEqual([UUID_A]);
  });

  it("limpa espaços e ignora nome em branco", () => {
    const r = productSchema.safeParse({
      ...BASE,
      newTags: ["  Doces  ", "   ", ""],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newTags).toEqual(["Doces"]);
  });

  it("junta nomes que só diferem na caixa — como o índice único do banco", () => {
    const r = productSchema.safeParse({
      ...BASE,
      newTags: ["Bebidas", "bebidas", "BEBIDAS"],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newTags).toEqual(["Bebidas"]);
  });

  it("recusa nome com mais de 30 caracteres", () => {
    const r = productSchema.safeParse({
      ...BASE,
      newTags: ["a".repeat(31)],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/30 caracteres/);
    }
  });

  it("limita o total de categorias por produto", () => {
    const r = productSchema.safeParse({
      ...BASE,
      newTags: Array.from({ length: 13 }, (_, i) => `Tag ${i}`),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "tags")).toBe(true);
    }
  });

  it("conta as duas listas juntas no limite", () => {
    const r = productSchema.safeParse({
      ...BASE,
      tagIds: [UUID_A, UUID_B],
      newTags: Array.from({ length: 11 }, (_, i) => `Tag ${i}`),
    });
    expect(r.success).toBe(false);
  });
});
