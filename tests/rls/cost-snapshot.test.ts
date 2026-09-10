import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Fundação de custo (plano 08, fase G1): toda venda grava em
 * sale_items.unit_cost um SNAPSHOT do products.cost_price do momento — é o
 * que garante que o lucro histórico (fase G3) não mude quando o custo do
 * produto mudar. Item avulso ou produto sem custo → null.
 *
 * Testes contra o banco real (compartilhado com o FiadoApp).
 */
describe("snapshot de custo em sale_items.unit_cost", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("custo");
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  async function novoProduto(
    app: ReturnType<typeof userClient>,
    name: string,
    price: number,
    costPrice: number | null,
  ): Promise<string> {
    const { data, error } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name,
        price,
        cost_price: costPrice,
        track_stock: true,
        stock_quantity: 100,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  async function itensDaVenda(
    app: ReturnType<typeof userClient>,
    saleId: string,
  ) {
    const { data } = await app
      .from("sale_items")
      .select("name_snapshot, unit_price, quantity, unit_cost")
      .eq("sale_id", saleId);
    return (data ?? []) as {
      name_snapshot: string;
      unit_price: number;
      quantity: number;
      unit_cost: number | null;
    }[];
  }

  it("venda à vista: grava o custo do produto; null para produto sem custo e item avulso", async () => {
    const app = userClient(user.accessToken);

    const comCusto = await novoProduto(app, "Café com custo", 20, 12.35);
    const semCusto = await novoProduto(app, "Café sem custo", 20, null);

    const { data: saleId, error } = await app.rpc("register_sale", {
      items: [
        {
          product_id: comCusto,
          name: "Café com custo",
          unit_price: 20,
          quantity: 2,
        },
        {
          product_id: semCusto,
          name: "Café sem custo",
          unit_price: 20,
          quantity: 1,
        },
        { product_id: null, name: "Item avulso", unit_price: 5, quantity: 1 },
      ],
      payment_method: "dinheiro",
    });
    expect(error).toBeNull();

    const itens = await itensDaVenda(app, saleId as string);
    expect(itens).toHaveLength(3);
    const byName = (n: string) => itens.find((i) => i.name_snapshot === n);
    expect(Number(byName("Café com custo")?.unit_cost)).toBe(12.35);
    expect(byName("Café sem custo")?.unit_cost).toBeNull();
    expect(byName("Item avulso")?.unit_cost).toBeNull();
  });

  it("o snapshot é histórico: mudar o custo depois não altera a venda passada", async () => {
    const app = userClient(user.accessToken);
    const produto = await novoProduto(app, "Feijão", 10, 6);

    const { data: saleId } = await app.rpc("register_sale", {
      items: [
        { product_id: produto, name: "Feijão", unit_price: 10, quantity: 1 },
      ],
      payment_method: "pix",
    });

    // Custo sobe (compra nova mais cara): o "último custo" do produto muda…
    const { error: upErr } = await app
      .from("products")
      .update({ cost_price: 9.5 })
      .eq("id", produto);
    expect(upErr).toBeNull();

    // …mas a venda já registrada continua com o custo daquele momento.
    const itens = await itensDaVenda(app, saleId as string);
    expect(Number(itens[0]?.unit_cost)).toBe(6);

    // E a venda seguinte já nasce com o custo novo.
    const { data: saleId2 } = await app.rpc("register_sale", {
      items: [
        { product_id: produto, name: "Feijão", unit_price: 10, quantity: 1 },
      ],
      payment_method: "pix",
    });
    const itens2 = await itensDaVenda(app, saleId2 as string);
    expect(Number(itens2[0]?.unit_cost)).toBe(9.5);
  });

  it("produto sob demanda (sem controle de estoque) também guarda o custo", async () => {
    const app = userClient(user.accessToken);
    const { data: prod } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name: "Marmita",
        price: 22,
        cost_price: 14,
        track_stock: false,
        stock_quantity: null,
      })
      .select("id")
      .single();
    const produto = (prod as { id: string }).id;

    const { data: saleId } = await app.rpc("register_sale", {
      items: [
        { product_id: produto, name: "Marmita", unit_price: 22, quantity: 1 },
      ],
      payment_method: "dinheiro",
    });
    const itens = await itensDaVenda(app, saleId as string);
    expect(Number(itens[0]?.unit_cost)).toBe(14);
  });

  it("o banco recusa custo negativo no produto", async () => {
    const app = userClient(user.accessToken);
    const { error } = await app.from("products").insert({
      user_id: user.id,
      name: "Custo inválido",
      price: 10,
      cost_price: -1,
      track_stock: false,
      stock_quantity: null,
    });
    expect(error).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // Cadastrar o custo DEPOIS (migration 0021). O relatório lê o retrato,
  // não o custo do produto — então cadastrar o custo tem de preencher os
  // retratos que ficaram em branco, senão o aviso "faltam produtos sem
  // custo" nunca sai (era a queixa do dono em 2026-09-10).
  // ------------------------------------------------------------------

  it("cadastrar o custo depois preenche o retrato em branco daquela venda", async () => {
    const app = userClient(user.accessToken);
    const produto = await novoProduto(app, "Bolo sem custo", 30, null);

    const { data: saleId, error } = await app.rpc("register_sale", {
      items: [
        {
          product_id: produto,
          name: "Bolo sem custo",
          unit_price: 30,
          quantity: 2,
        },
      ],
      payment_method: "dinheiro",
    });
    expect(error).toBeNull();

    const antes = await itensDaVenda(app, saleId as string);
    expect(antes[0]?.unit_cost).toBeNull();

    // A lista do fechamento acusa o produto...
    const { data: listaAntes } = await app.rpc("produtos_sem_custo", {
      p_from: "2000-01-01T00:00:00Z",
      p_to: "2999-01-01T00:00:00Z",
      p_methods: null,
    });
    expect(
      ((listaAntes ?? []) as { product_id: string | null }[]).some(
        (l) => l.product_id === produto,
      ),
    ).toBe(true);

    const { error: erroCusto } = await app
      .from("products")
      .update({ cost_price: 12 })
      .eq("id", produto);
    expect(erroCusto).toBeNull();

    const depois = await itensDaVenda(app, saleId as string);
    expect(Number(depois[0]?.unit_cost)).toBe(12);

    // ...e para de acusar depois do cadastro.
    const { data: listaDepois } = await app.rpc("produtos_sem_custo", {
      p_from: "2000-01-01T00:00:00Z",
      p_to: "2999-01-01T00:00:00Z",
      p_methods: null,
    });
    expect(
      ((listaDepois ?? []) as { product_id: string | null }[]).some(
        (l) => l.product_id === produto,
      ),
    ).toBe(false);
  });

  it("preencher não reescreve o retrato de uma venda que já tinha custo", async () => {
    const app = userClient(user.accessToken);
    const produto = await novoProduto(app, "Pao com custo antigo", 10, 4);

    const { data: saleId } = await app.rpc("register_sale", {
      items: [
        {
          product_id: produto,
          name: "Pao com custo antigo",
          unit_price: 10,
          quantity: 1,
        },
      ],
      payment_method: "dinheiro",
    });
    expect(
      Number((await itensDaVenda(app, saleId as string))[0]?.unit_cost),
    ).toBe(4);

    // Zera e cadastra de novo: a transição "sem custo → com custo" acontece,
    // mas a venda antiga NÃO pode ser reescrita — ela já tem o seu retrato.
    await app.from("products").update({ cost_price: null }).eq("id", produto);
    await app.from("products").update({ cost_price: 9 }).eq("id", produto);

    expect(
      Number((await itensDaVenda(app, saleId as string))[0]?.unit_cost),
    ).toBe(4);
  });

  it("item avulso continua sem custo: não há produto de onde tirar", async () => {
    const app = userClient(user.accessToken);
    const { data: saleId } = await app.rpc("register_sale", {
      items: [
        {
          product_id: null,
          name: "Avulso sem dono",
          unit_price: 7,
          quantity: 1,
        },
      ],
      payment_method: "dinheiro",
    });

    const itens = await itensDaVenda(app, saleId as string);
    expect(itens[0]?.unit_cost).toBeNull();
  });

  it("o item de venda continua histórico: PATCH direto é barrado", async () => {
    const app = userClient(user.accessToken);
    const produto = await novoProduto(app, "Queijo do guard", 20, null);
    const { data: saleId } = await app.rpc("register_sale", {
      items: [
        {
          product_id: produto,
          name: "Queijo do guard",
          unit_price: 20,
          quantity: 1,
        },
      ],
      payment_method: "dinheiro",
    });

    const { data: itemData } = await app
      .from("sale_items")
      .select("id")
      .eq("sale_id", saleId as string)
      .single();
    const itemId = (itemData as { id: string }).id;

    // Custo inventado (o produto está sem custo): recusado.
    const { error: erroInventado } = await app
      .from("sale_items")
      .update({ unit_cost: 1 })
      .eq("id", itemId);
    expect(erroInventado).not.toBeNull();

    // Mudar o valor da venda: recusado.
    const { error: erroValor } = await app
      .from("sale_items")
      .update({ unit_price: 999 })
      .eq("id", itemId);
    expect(erroValor).not.toBeNull();

    // Com o custo cadastrado, o retrato já foi preenchido pelo trigger —
    // e reescrevê-lo com outro valor continua barrado.
    await app.from("products").update({ cost_price: 6 }).eq("id", produto);
    const { data: depois } = await app
      .from("sale_items")
      .select("unit_cost")
      .eq("id", itemId)
      .single();
    expect(Number((depois as { unit_cost: number }).unit_cost)).toBe(6);

    const { error: erroReescrita } = await app
      .from("sale_items")
      .update({ unit_cost: 2 })
      .eq("id", itemId);
    expect(erroReescrita).not.toBeNull();
  });
});

/**
 * A venda a prazo passa pela RPC-ponte registrar_venda_fiado, que chama
 * register_sale — logo o snapshot de custo vale igual para o fiado (o
 * relatório da fase G3 vai alocá-lo na quitação, não na venda).
 */
describe("snapshot de custo na venda a prazo (FiadoApp)", () => {
  it("venda fiado grava unit_cost do produto e null no item avulso", async () => {
    const u = await createTestUser("custo-fiado");
    try {
      const app = userClient(u.accessToken);
      await app.from("ecossistema_prefs").upsert({
        user_id: u.id,
        fiado_pdv_ativo: true,
        updated_at: new Date().toISOString(),
      });

      const { data: prod } = await app
        .from("products")
        .insert({
          user_id: u.id,
          name: "Açúcar",
          price: 8,
          cost_price: 5.25,
          track_stock: true,
          stock_quantity: 20,
        })
        .select("id")
        .single();
      const produto = (prod as { id: string }).id;

      const { data, error } = await app.rpc("registrar_venda_fiado", {
        p_items: [
          { product_id: produto, name: "Açúcar", unit_price: 8, quantity: 2 },
          { product_id: null, name: "Sacola", unit_price: 1, quantity: 1 },
        ],
        p_itens_fiado: [
          { descricao: "2 x Açúcar", quantidade: 1, valor_unitario: 16 },
          { descricao: "Sacola", quantidade: 1, valor_unitario: 1 },
        ],
        p_cliente_id: null,
        p_cliente: {
          nome: "Cliente",
          sobrenome: "Custo",
          referencia: "Balcão",
          telefone: null,
        },
        p_data_vencimento: null,
        p_observacao: null,
      });
      expect(error).toBeNull();
      const { sale_id } = data as { venda_id: string; sale_id: string };

      const { data: itens } = await app
        .from("sale_items")
        .select("name_snapshot, unit_cost")
        .eq("sale_id", sale_id);
      const rows = (itens ?? []) as {
        name_snapshot: string;
        unit_cost: number | null;
      }[];
      expect(
        Number(rows.find((i) => i.name_snapshot === "Açúcar")?.unit_cost),
      ).toBe(5.25);
      expect(
        rows.find((i) => i.name_snapshot === "Sacola")?.unit_cost,
      ).toBeNull();
    } finally {
      await deleteTestUser(u);
    }
  });
});

/**
 * RLS: custo é informação sensível do negócio — não pode vazar entre
 * usuários, nem no produto nem no snapshot da venda.
 */
describe("RLS — custo não vaza entre usuários", () => {
  it("outro usuário não lê cost_price nem unit_cost", async () => {
    const alice = await createTestUser("custo-a");
    const bob = await createTestUser("custo-b");
    try {
      const aliceApp = userClient(alice.accessToken);
      const bobApp = userClient(bob.accessToken);

      const { data: prod } = await aliceApp
        .from("products")
        .insert({
          user_id: alice.id,
          name: "Produto da Alice",
          price: 30,
          cost_price: 18,
          track_stock: true,
          stock_quantity: 5,
        })
        .select("id")
        .single();
      const produto = (prod as { id: string }).id;

      const { data: saleId } = await aliceApp.rpc("register_sale", {
        items: [
          {
            product_id: produto,
            name: "Produto da Alice",
            unit_price: 30,
            quantity: 1,
          },
        ],
        payment_method: "dinheiro",
      });

      const { data: produtoBob } = await bobApp
        .from("products")
        .select("id, cost_price")
        .eq("id", produto)
        .maybeSingle();
      expect(produtoBob).toBeNull();

      const { data: itensBob } = await bobApp
        .from("sale_items")
        .select("unit_cost")
        .eq("sale_id", saleId as string);
      expect(itensBob ?? []).toHaveLength(0);
    } finally {
      await deleteTestUser(alice);
      await deleteTestUser(bob);
    }
  });
});
