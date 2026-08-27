import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Núcleo de compras (plano 08, fase G2a): a RPC registrar_compra grava, numa
 * ÚNICA transação, a nota (purchases + purchase_items), a entrada de estoque,
 * o ÚLTIMO CUSTO dos produtos, os produtos novos (com código de barras) e o
 * gasto automático em 'insumos'. Testes contra o banco real (compartilhado
 * com o FiadoApp).
 */

/** Chave de acesso fictícia de 44 dígitos, única por execução. */
function chaveFicticia(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 1e12)}`;
  return (base + "0".repeat(44)).slice(0, 44);
}

describe("RPC registrar_compra (entrada por nota)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("compras");
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  it("grava nota, itens, estoque, último custo, movimento e gasto — tudo junto", async () => {
    const app = userClient(user.accessToken);

    // Produto já cadastrado, com estoque 10 e custo antigo de R$ 4,00.
    const { data: prod } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name: "Arroz 5kg",
        price: 28,
        cost_price: 4,
        track_stock: true,
        stock_quantity: 10,
      })
      .select("id")
      .single();
    const produto = (prod as { id: string }).id;

    const chave = chaveFicticia();
    const { data, error } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Atacadão do Bairro",
        access_key: chave,
        issued_on: "2026-08-20",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Arroz 5kg",
          quantity: 6,
          unit_cost: 5.5,
        },
        {
          is_new: true,
          description: "Feijão carioca 1kg",
          barcode: `789${Date.now()}`.slice(0, 13),
          quantity: 12,
          unit_cost: 7.25,
          sale_price: 11.9,
          track_stock: true,
        },
      ],
    });
    expect(error).toBeNull();

    const resumo = data as {
      purchase_id: string;
      total: number;
      produtos_atualizados: number;
      produtos_novos: number;
      expense_id: string | null;
    };
    // 6 × 5,50 = 33,00  +  12 × 7,25 = 87,00  →  120,00
    expect(Number(resumo.total)).toBe(120);
    expect(resumo.produtos_atualizados).toBe(1);
    expect(resumo.produtos_novos).toBe(1);
    expect(resumo.expense_id).toBeTruthy();

    // ── A nota ────────────────────────────────────────────────────────
    const { data: nota } = await app
      .from("purchases")
      .select("supplier_name, access_key, issued_on, total, source")
      .eq("id", resumo.purchase_id)
      .single();
    expect(nota?.supplier_name).toBe("Atacadão do Bairro");
    expect(nota?.access_key).toBe(chave);
    expect(nota?.issued_on).toBe("2026-08-20");
    expect(Number(nota?.total)).toBe(120);
    expect(nota?.source).toBe("manual");

    // ── Os itens ──────────────────────────────────────────────────────
    const { data: itens } = await app
      .from("purchase_items")
      .select("description_snapshot, quantity, unit_cost, line_total, product_id")
      .eq("purchase_id", resumo.purchase_id);
    const rows = (itens ?? []) as {
      description_snapshot: string;
      quantity: number;
      unit_cost: number;
      line_total: number;
      product_id: string | null;
    }[];
    expect(rows).toHaveLength(2);
    const arroz = rows.find((i) => i.description_snapshot === "Arroz 5kg");
    expect(Number(arroz?.unit_cost)).toBe(5.5);
    expect(Number(arroz?.line_total)).toBe(33);
    expect(arroz?.product_id).toBe(produto);

    // ── Estoque e ÚLTIMO CUSTO do produto existente ───────────────────
    const { data: depois } = await app
      .from("products")
      .select("stock_quantity, cost_price")
      .eq("id", produto)
      .single();
    expect(Number((depois as { stock_quantity: number }).stock_quantity)).toBe(16);
    expect(Number((depois as { cost_price: number }).cost_price)).toBe(5.5);

    // ── Movimento de estoque do tipo 'purchase' ───────────────────────
    const { data: movs } = await app
      .from("stock_movements")
      .select("type, quantity, note")
      .eq("product_id", produto)
      .eq("type", "purchase");
    const movimentos = (movs ?? []) as {
      type: string;
      quantity: number;
      note: string | null;
    }[];
    expect(movimentos).toHaveLength(1);
    expect(Number(movimentos[0]?.quantity)).toBe(6);
    expect(movimentos[0]?.note).toContain("Atacadão do Bairro");

    // ── Gasto automático em 'insumos', na data da compra ──────────────
    const { data: gasto } = await app
      .from("expenses")
      .select("category, amount, incurred_on, description")
      .eq("id", resumo.expense_id)
      .single();
    expect(gasto?.category).toBe("insumos");
    expect(Number(gasto?.amount)).toBe(120);
    expect(gasto?.incurred_on).toBe("2026-08-20");
    expect(gasto?.description).toContain("Atacadão do Bairro");
  });

  it("produto novo é criado com custo, preço, estoque e código de barras", async () => {
    const app = userClient(user.accessToken);
    const codigo = `790${Date.now()}`.slice(0, 13);

    const { data, error } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Distribuidora Nova",
        access_key: null,
        issued_on: "2026-08-21",
        source: "manual",
      },
      p_itens: [
        {
          is_new: true,
          description: "Café torrado 500g",
          barcode: codigo,
          quantity: 20,
          unit_cost: 9.9,
          sale_price: 16.5,
          track_stock: true,
        },
      ],
    });
    expect(error).toBeNull();
    const resumo = data as { purchase_id: string; produtos_novos: number };
    expect(resumo.produtos_novos).toBe(1);

    const { data: novo } = await app
      .from("products")
      .select("id, name, price, cost_price, track_stock, stock_quantity")
      .eq("name", "Café torrado 500g")
      .single();
    const criado = novo as {
      id: string;
      price: number;
      cost_price: number;
      track_stock: boolean;
      stock_quantity: number;
    };
    expect(Number(criado.price)).toBe(16.5);
    expect(Number(criado.cost_price)).toBe(9.9);
    expect(criado.track_stock).toBe(true);
    expect(Number(criado.stock_quantity)).toBe(20); // nasce zerado + entrada

    const { data: barcodes } = await app
      .from("product_barcodes")
      .select("barcode")
      .eq("product_id", criado.id);
    expect((barcodes ?? []).map((b) => (b as { barcode: string }).barcode)).toEqual([
      codigo,
    ]);

    // O item da nota ficou vinculado ao produto recém-criado.
    const { data: item } = await app
      .from("purchase_items")
      .select("product_id")
      .eq("purchase_id", resumo.purchase_id)
      .single();
    expect((item as { product_id: string }).product_id).toBe(criado.id);
  });

  it("recusa a mesma nota duas vezes (chave de acesso duplicada)", async () => {
    const app = userClient(user.accessToken);
    const chave = chaveFicticia();
    const payload = {
      p_purchase: {
        supplier_name: "Fornecedor Repetido",
        access_key: chave,
        issued_on: "2026-08-22",
        source: "manual",
      },
      p_itens: [
        {
          is_new: true,
          description: "Item da nota repetida",
          quantity: 1,
          unit_cost: 10,
          sale_price: 20,
          track_stock: true,
        },
      ],
    };

    const { error: primeira } = await app.rpc("registrar_compra", payload);
    expect(primeira).toBeNull();

    const { error: segunda } = await app.rpc("registrar_compra", payload);
    expect(segunda).not.toBeNull();

    // Só uma nota com aquela chave; a segunda tentativa não deixou rastro.
    const { count: notas } = await app
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("access_key", chave);
    expect(notas).toBe(1);
    const { count: produtos } = await app
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("name", "Item da nota repetida");
    expect(produtos).toBe(1);
  });

  it("falha atômica: erro em um item não grava nada da nota", async () => {
    const outro = await createTestUser("compras-alheio");
    try {
      const app = userClient(user.accessToken);
      const alheio = userClient(outro.accessToken);

      // Produto de OUTRO usuário — referenciá-lo tem que abortar a nota.
      const { data: prod } = await alheio
        .from("products")
        .insert({
          user_id: outro.id,
          name: "Produto alheio",
          price: 10,
          track_stock: true,
          stock_quantity: 1,
        })
        .select("id")
        .single();
      const produtoAlheio = (prod as { id: string }).id;

      const chave = chaveFicticia();
      const { error } = await app.rpc("registrar_compra", {
        p_purchase: {
          supplier_name: "Fornecedor Atômico",
          access_key: chave,
          issued_on: "2026-08-23",
          source: "manual",
        },
        p_itens: [
          {
            is_new: true,
            description: "Item que não pode sobrar",
            quantity: 3,
            unit_cost: 5,
            sale_price: 9,
            track_stock: true,
          },
          {
            product_id: produtoAlheio,
            description: "Produto alheio",
            quantity: 1,
            unit_cost: 5,
          },
        ],
      });
      expect(error).not.toBeNull();

      // Nada gravado: nem nota, nem produto do primeiro item, nem gasto.
      const { count: notas } = await app
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq("access_key", chave);
      expect(notas ?? 0).toBe(0);
      const { count: produtos } = await app
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("name", "Item que não pode sobrar");
      expect(produtos ?? 0).toBe(0);
      const { count: gastos } = await app
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("description", "Compra de mercadorias — Fornecedor Atômico");
      expect(gastos ?? 0).toBe(0);

      // E o estoque do produto alheio segue intacto.
      const { data: intacto } = await alheio
        .from("products")
        .select("stock_quantity")
        .eq("id", produtoAlheio)
        .single();
      expect(
        Number((intacto as { stock_quantity: number }).stock_quantity),
      ).toBe(1);
    } finally {
      await deleteTestUser(outro);
    }
  });

  it("produto sob demanda recebe o custo, mas não movimenta estoque", async () => {
    const app = userClient(user.accessToken);
    const { data: prod } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name: "Marmita da nota",
        price: 25,
        cost_price: 10,
        track_stock: false,
        stock_quantity: null,
      })
      .select("id")
      .single();
    const produto = (prod as { id: string }).id;

    const { error } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: null,
        access_key: null,
        issued_on: "2026-08-24",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Marmita da nota",
          quantity: 4,
          unit_cost: 12.5,
        },
      ],
    });
    expect(error).toBeNull();

    const { data: depois } = await app
      .from("products")
      .select("cost_price, stock_quantity")
      .eq("id", produto)
      .single();
    expect(Number((depois as { cost_price: number }).cost_price)).toBe(12.5);
    expect((depois as { stock_quantity: number | null }).stock_quantity).toBeNull();

    const { count: movs } = await app
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("product_id", produto);
    expect(movs ?? 0).toBe(0);
  });

  it("recusa chave de acesso fora do formato (44 dígitos)", async () => {
    const app = userClient(user.accessToken);
    const { error } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Chave Torta",
        access_key: "123",
        issued_on: "2026-08-25",
        source: "manual",
      },
      p_itens: [
        {
          is_new: true,
          description: "Item chave torta",
          quantity: 1,
          unit_cost: 1,
          sale_price: 2,
          track_stock: true,
        },
      ],
    });
    expect(error).not.toBeNull();
  });
});

/**
 * RLS: a nota de compra é dado sensível do negócio (fornecedor, custos) —
 * não pode vazar nem ser gravada em nome de outro usuário.
 */
describe("RLS — compras não vazam entre usuários", () => {
  it("outro usuário não lê a nota nem os itens, e não escreve em nome alheio", async () => {
    const alice = await createTestUser("compras-a");
    const bob = await createTestUser("compras-b");
    try {
      const aliceApp = userClient(alice.accessToken);
      const bobApp = userClient(bob.accessToken);

      const chave = chaveFicticia();
      const { data } = await aliceApp.rpc("registrar_compra", {
        p_purchase: {
          supplier_name: "Fornecedor da Alice",
          access_key: chave,
          issued_on: "2026-08-26",
          source: "manual",
        },
        p_itens: [
          {
            is_new: true,
            description: "Produto secreto da Alice",
            quantity: 2,
            unit_cost: 30,
            sale_price: 50,
            track_stock: true,
          },
        ],
      });
      const { purchase_id } = data as { purchase_id: string };

      const { data: notaBob } = await bobApp
        .from("purchases")
        .select("id, supplier_name, total")
        .eq("id", purchase_id)
        .maybeSingle();
      expect(notaBob).toBeNull();

      const { data: itensBob } = await bobApp
        .from("purchase_items")
        .select("description_snapshot, unit_cost")
        .eq("purchase_id", purchase_id);
      expect(itensBob ?? []).toHaveLength(0);

      // Nem consegue inserir uma nota em nome da Alice.
      const { error: insertErro } = await bobApp.from("purchases").insert({
        user_id: alice.id,
        supplier_name: "Nota forjada",
        issued_on: "2026-08-26",
        total: 0,
      });
      expect(insertErro).not.toBeNull();

      // A dona continua vendo a própria nota.
      const { data: notaAlice } = await aliceApp
        .from("purchases")
        .select("supplier_name")
        .eq("id", purchase_id)
        .single();
      expect(notaAlice?.supplier_name).toBe("Fornecedor da Alice");
    } finally {
      await deleteTestUser(alice);
      await deleteTestUser(bob);
    }
  });
});
