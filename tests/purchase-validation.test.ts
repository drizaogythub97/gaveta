import { describe, expect, it } from "vitest";

import { purchaseSchema } from "@/lib/validations/purchases";

/**
 * Entrada por nota (plano 08, fase G2a): validação de servidor. O formulário
 * já orienta o usuário, mas é este schema que decide o que pode chegar à RPC.
 */

const PRODUTO = "11111111-1111-4111-8111-111111111111";
const CHAVE = "3".repeat(44);

function itemExistente(over: Record<string, unknown> = {}) {
  return {
    productId: PRODUTO,
    isNew: false,
    description: "Arroz 5kg",
    barcode: null,
    quantity: 6,
    unitCost: 5.5,
    salePrice: null,
    trackStock: true,
    ...over,
  };
}

function itemNovo(over: Record<string, unknown> = {}) {
  return {
    productId: null,
    isNew: true,
    description: "Feijão 1kg",
    barcode: "7891234567890",
    quantity: 12,
    unitCost: 7.25,
    salePrice: 11.9,
    trackStock: true,
    ...over,
  };
}

function nota(over: Record<string, unknown> = {}) {
  return {
    supplierName: "Atacadão do Bairro",
    accessKey: null,
    issuedOn: "2026-08-20",
    source: "manual",
    items: [itemExistente()],
    ...over,
  };
}

describe("purchaseSchema — nota de compra", () => {
  it("aceita uma nota com produto existente e produto novo", () => {
    const parsed = purchaseSchema.safeParse(
      nota({ items: [itemExistente(), itemNovo()] }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.items).toHaveLength(2);
  });

  it("fornecedor vazio vira null (campo é opcional)", () => {
    const parsed = purchaseSchema.safeParse(nota({ supplierName: "   " }));
    expect(parsed.success && parsed.data.supplierName).toBeNull();
  });

  it("aceita a chave copiada com espaços e pontos, guardando só os números", () => {
    const comEspacos = CHAVE.replace(/(.{4})/g, "$1 ").trim();
    const parsed = purchaseSchema.safeParse(nota({ accessKey: comEspacos }));
    expect(parsed.success && parsed.data.accessKey).toBe(CHAVE);
  });

  it("chave em branco vira null; chave incompleta é recusada", () => {
    const vazia = purchaseSchema.safeParse(nota({ accessKey: "" }));
    expect(vazia.success && vazia.data.accessKey).toBeNull();

    const curta = purchaseSchema.safeParse(nota({ accessKey: "123456" }));
    expect(curta.success).toBe(false);
    expect(
      !curta.success &&
        curta.error.issues.some((i) => /44 números/.test(i.message)),
    ).toBe(true);
  });

  it("recusa nota sem itens", () => {
    const parsed = purchaseSchema.safeParse(nota({ items: [] }));
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some((i) => /ao menos um item/.test(i.message)),
    ).toBe(true);
  });

  it("recusa data de compra no futuro", () => {
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const parsed = purchaseSchema.safeParse(nota({ issuedOn: amanha }));
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some((i) => /futuro/.test(i.message)),
    ).toBe(true);
  });

  it("recusa quantidade zerada e custo negativo", () => {
    const semQtd = purchaseSchema.safeParse(
      nota({ items: [itemExistente({ quantity: 0 })] }),
    );
    expect(semQtd.success).toBe(false);

    const custoNegativo = purchaseSchema.safeParse(
      nota({ items: [itemExistente({ unitCost: -1 })] }),
    );
    expect(custoNegativo.success).toBe(false);
  });

  it("produto novo precisa de preço de venda", () => {
    const parsed = purchaseSchema.safeParse(
      nota({ items: [itemNovo({ salePrice: null })] }),
    );
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some((i) => /preço de venda/.test(i.message)),
    ).toBe(true);
  });

  it("item que não é novo precisa apontar para um produto", () => {
    const parsed = purchaseSchema.safeParse(
      nota({ items: [itemExistente({ productId: null })] }),
    );
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some((i) => /Escolha o produto/.test(i.message)),
    ).toBe(true);
  });

  it("item novo não pode apontar para um produto já cadastrado", () => {
    const parsed = purchaseSchema.safeParse(
      nota({ items: [itemNovo({ productId: PRODUTO })] }),
    );
    expect(parsed.success).toBe(false);
  });

  it("recusa origem fora da lista", () => {
    const parsed = purchaseSchema.safeParse(nota({ source: "email" }));
    expect(parsed.success).toBe(false);
  });
});
