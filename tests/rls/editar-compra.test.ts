import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Correção de nota já lançada (roadmap H1): a RPC editar_compra troca os
 * itens da nota e acerta, na MESMA transação, o estoque (pela DIFERENÇA), o
 * último custo dos produtos e o gasto em 'insumos'. Testes contra o banco
 * real (compartilhado com o FiadoApp).
 *
 * O caso que mais importa aqui é o do estoque: "estornar e relançar" zeraria
 * o estoque de quem já vendeu parte da mercadoria. Corrigir tem de mexer só
 * o que mudou.
 *
 * ⚠️ Um usuário só por arquivo (limite de taxa do Supabase Auth). O acesso
 * cruzado entre contas fica em isolation-extended.test.ts.
 */

/** Chave de acesso fictícia de 44 dígitos, única por execução. */
function chaveFicticia(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 1e12)}`;
  return (base + "0".repeat(44)).slice(0, 44);
}

type ResumoCompra = {
  purchase_id: string;
  total: number;
  expense_id: string | null;
};

type ResumoEdicao = {
  purchase_id: string;
  total: number;
  itens: number;
  produtos_atualizados: number;
  produtos_novos: number;
  estoque_parcial: boolean;
  custos_ajustados: number;
  gasto: string;
  expense_id: string | null;
};

describe("RPC editar_compra (correção de nota lançada)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("editar-compra");
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  async function criarProduto(
    nome: string,
    opts: { stock?: number | null; cost?: number | null; track?: boolean } = {},
  ): Promise<string> {
    const app = userClient(user.accessToken);
    const { data, error } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name: nome,
        price: 20,
        cost_price: opts.cost ?? null,
        track_stock: opts.track ?? true,
        stock_quantity: opts.track === false ? null : (opts.stock ?? 0),
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
    return (data as { id: string }).id;
  }

  async function lerProduto(id: string) {
    const app = userClient(user.accessToken);
    const { data } = await app
      .from("products")
      .select("stock_quantity, cost_price")
      .eq("id", id)
      .single();
    return data as { stock_quantity: number | null; cost_price: number | null };
  }

  it("corrige valores: estoque anda a diferença, custo e gasto acompanham", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Feijão da correção", {
      stock: 0,
      cost: null,
    });

    const { data: lancadaData, error: erroLancar } = await app.rpc(
      "registrar_compra",
      {
        p_purchase: {
          supplier_name: "Fornecedor Errado",
          access_key: chaveFicticia(),
          issued_on: "2026-08-10",
          source: "manual",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Feijão da correção",
            quantity: 10,
            unit_cost: 5,
          },
        ],
      },
    );
    expect(erroLancar).toBeNull();
    const lancada = lancadaData as ResumoCompra;
    expect(Number(lancada.total)).toBe(50);

    const depoisDoLancamento = await lerProduto(produto);
    expect(Number(depoisDoLancamento.stock_quantity)).toBe(10);
    expect(Number(depoisDoLancamento.cost_price)).toBe(5);

    // A correção: chegaram 12 (não 10) e o custo real foi 5,50.
    const { data: edicaoData, error: erroEditar } = await app.rpc(
      "editar_compra",
      {
        p_purchase_id: lancada.purchase_id,
        p_purchase: {
          supplier_name: "Fornecedor Certo",
          access_key: null,
          issued_on: "2026-08-11",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Feijão da correção",
            quantity: 12,
            unit_cost: 5.5,
          },
        ],
      },
    );
    expect(erroEditar).toBeNull();
    const edicao = edicaoData as ResumoEdicao;

    expect(Number(edicao.total)).toBe(66);
    expect(edicao.itens).toBe(1);
    expect(edicao.estoque_parcial).toBe(false);
    expect(edicao.gasto).toBe("atualizado");
    // O gasto é o MESMO lançamento, corrigido — não um novo.
    expect(edicao.expense_id).toBe(lancada.expense_id);

    const depoisDaCorrecao = await lerProduto(produto);
    expect(Number(depoisDaCorrecao.stock_quantity)).toBe(12);
    expect(Number(depoisDaCorrecao.cost_price)).toBe(5.5);

    const { data: notaData } = await app
      .from("purchases")
      .select("supplier_name, issued_on, total, access_key, edited_at, source")
      .eq("id", lancada.purchase_id)
      .single();
    const nota = notaData as {
      supplier_name: string;
      issued_on: string;
      total: number;
      access_key: string | null;
      edited_at: string | null;
      source: string;
    };
    expect(nota.supplier_name).toBe("Fornecedor Certo");
    expect(nota.issued_on).toBe("2026-08-11");
    expect(Number(nota.total)).toBe(66);
    expect(nota.access_key).toBeNull();
    expect(nota.edited_at).not.toBeNull();
    // A origem da nota é histórico: continua 'manual'.
    expect(nota.source).toBe("manual");

    const { data: gastoData } = await app
      .from("expenses")
      .select("amount, incurred_on, description, category")
      .eq("id", lancada.expense_id!)
      .single();
    const gasto = gastoData as {
      amount: number;
      incurred_on: string;
      description: string;
      category: string;
    };
    expect(Number(gasto.amount)).toBe(66);
    expect(gasto.incurred_on).toBe("2026-08-11");
    expect(gasto.category).toBe("insumos");
    expect(gasto.description).toContain("Fornecedor Certo");

    // Os itens antigos deram lugar aos novos — sem sobrar linha.
    const { data: itensData } = await app
      .from("purchase_items")
      .select("quantity, unit_cost, line_total")
      .eq("purchase_id", lancada.purchase_id);
    const itens = itensData as {
      quantity: number;
      unit_cost: number;
      line_total: number;
    }[];
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].quantity)).toBe(12);
    expect(Number(itens[0].unit_cost)).toBe(5.5);
    expect(Number(itens[0].line_total)).toBe(66);
  });

  it("não apaga o que já foi vendido: a redução tira só a diferença", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Óleo da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Distribuidora",
        access_key: chaveFicticia(),
        issued_on: "2026-08-12",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Óleo da correção",
          quantity: 10,
          unit_cost: 8,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    // Simula a saída de 8 unidades por venda: sobram 2 no estoque.
    const { error: erroVenda } = await app
      .from("products")
      .update({ stock_quantity: 2 })
      .eq("id", produto);
    expect(erroVenda).toBeNull();

    // A nota dizia 10, mas na verdade chegaram 9: sai UMA unidade.
    const { data: edicaoData, error: erroEditar } = await app.rpc(
      "editar_compra",
      {
        p_purchase_id: lancada.purchase_id,
        p_purchase: {
          supplier_name: "Distribuidora",
          access_key: null,
          issued_on: "2026-08-12",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Óleo da correção",
            quantity: 9,
            unit_cost: 8,
          },
        ],
      },
    );
    expect(erroEditar).toBeNull();
    const edicao = edicaoData as ResumoEdicao;
    expect(edicao.estoque_parcial).toBe(false);

    // 2 − 1 = 1. Um "estorna e relança" teria zerado e devolvido 9.
    const depois = await lerProduto(produto);
    expect(Number(depois.stock_quantity)).toBe(1);

    // O acerto aparece na movimentação, com o texto da correção.
    const { data: movData } = await app
      .from("stock_movements")
      .select("type, quantity, note")
      .eq("product_id", produto)
      .order("created_at", { ascending: false })
      .limit(1);
    const mov = (movData ?? []) as {
      type: string;
      quantity: number;
      note: string | null;
    }[];
    expect(mov).toHaveLength(1);
    expect(mov[0].type).toBe("void");
    expect(Number(mov[0].quantity)).toBe(-1);
    expect(mov[0].note).toContain("Correção de nota");
  });

  it("corta em zero quando a correção tiraria mais do que existe", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Açúcar da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Mercearia",
        access_key: chaveFicticia(),
        issued_on: "2026-08-13",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Açúcar da correção",
          quantity: 10,
          unit_cost: 4,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    // Vendeu quase tudo: sobrou 1.
    await app.from("products").update({ stock_quantity: 1 }).eq("id", produto);

    // Na verdade chegaram só 2: a diferença (−8) é maior que o estoque.
    const { data: edicaoData, error: erroEditar } = await app.rpc(
      "editar_compra",
      {
        p_purchase_id: lancada.purchase_id,
        p_purchase: {
          supplier_name: "Mercearia",
          access_key: null,
          issued_on: "2026-08-13",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Açúcar da correção",
            quantity: 2,
            unit_cost: 4,
          },
        ],
      },
    );
    expect(erroEditar).toBeNull();
    expect((edicaoData as ResumoEdicao).estoque_parcial).toBe(true);

    const depois = await lerProduto(produto);
    expect(Number(depois.stock_quantity)).toBe(0);
  });

  it("item retirado da nota devolve o custo à compra anterior", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Café da correção", { stock: 0 });
    const outro = await criarProduto("Leite da correção", { stock: 0 });

    // Compra anterior, que fica ativa: custo 9,00.
    await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Torrefação",
        access_key: chaveFicticia(),
        issued_on: "2026-08-14",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Café da correção",
          quantity: 3,
          unit_cost: 9,
        },
      ],
    });

    // A nota a corrigir traz o café por engano (custo 11) e o leite.
    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Atacado",
        access_key: chaveFicticia(),
        issued_on: "2026-08-15",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Café da correção",
          quantity: 4,
          unit_cost: 11,
        },
        {
          product_id: outro,
          description: "Leite da correção",
          quantity: 6,
          unit_cost: 3,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;
    expect(Number((await lerProduto(produto)).cost_price)).toBe(11);
    expect(Number((await lerProduto(produto)).stock_quantity)).toBe(7);

    // Correção: o café não era desta nota. Fica só o leite.
    const { data: edicaoData, error: erroEditar } = await app.rpc(
      "editar_compra",
      {
        p_purchase_id: lancada.purchase_id,
        p_purchase: {
          supplier_name: "Atacado",
          access_key: null,
          issued_on: "2026-08-15",
        },
        p_itens: [
          {
            product_id: outro,
            description: "Leite da correção",
            quantity: 6,
            unit_cost: 3,
          },
        ],
      },
    );
    expect(erroEditar).toBeNull();
    expect(Number((edicaoData as ResumoEdicao).total)).toBe(18);

    const cafe = await lerProduto(produto);
    // Saiu o que esta nota tinha trazido, e o custo voltou ao da anterior.
    expect(Number(cafe.stock_quantity)).toBe(3);
    expect(Number(cafe.cost_price)).toBe(9);

    // O leite não foi tocado.
    const leite = await lerProduto(outro);
    expect(Number(leite.stock_quantity)).toBe(6);
    expect(Number(leite.cost_price)).toBe(3);
  });

  it("respeita o custo que o dono digitou à mão depois da nota", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Sal da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor",
        access_key: chaveFicticia(),
        issued_on: "2026-08-16",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Sal da correção",
          quantity: 5,
          unit_cost: 2,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    // O dono passou a usar outro custo (dado dele, não da nota).
    await app.from("products").update({ cost_price: 7 }).eq("id", produto);

    const { error: erroEditar } = await app.rpc("editar_compra", {
      p_purchase_id: lancada.purchase_id,
      p_purchase: {
        supplier_name: "Fornecedor",
        access_key: null,
        issued_on: "2026-08-16",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Sal da correção",
          quantity: 5,
          unit_cost: 2.5,
        },
      ],
    });
    expect(erroEditar).toBeNull();

    const depois = await lerProduto(produto);
    expect(Number(depois.cost_price)).toBe(7);
  });

  it("nota cancelada não pode ser corrigida", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Trigo da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Moinho",
        access_key: chaveFicticia(),
        issued_on: "2026-08-17",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Trigo da correção",
          quantity: 2,
          unit_cost: 6,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    const { error: erroEstorno } = await app.rpc("estornar_compra", {
      p_purchase_id: lancada.purchase_id,
    });
    expect(erroEstorno).toBeNull();

    const { error } = await app.rpc("editar_compra", {
      p_purchase_id: lancada.purchase_id,
      p_purchase: {
        supplier_name: "Moinho",
        access_key: null,
        issued_on: "2026-08-17",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Trigo da correção",
          quantity: 3,
          unit_cost: 6,
        },
      ],
    });
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("cancelada");
  });

  it("a nota continua histórico fora da RPC: PATCH e DELETE diretos são barrados", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Milho da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Cerealista",
        access_key: chaveFicticia(),
        issued_on: "2026-08-18",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Milho da correção",
          quantity: 4,
          unit_cost: 3,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    // Mudar o total direto na API deixaria a nota discordando do estoque.
    const { error: erroPatch } = await app
      .from("purchases")
      .update({ total: 1 })
      .eq("id", lancada.purchase_id);
    expect(erroPatch).not.toBeNull();

    // Apagar item direto deixaria o estoque que entrou sem origem.
    const { error: erroDelete } = await app
      .from("purchase_items")
      .delete()
      .eq("purchase_id", lancada.purchase_id);
    expect(erroDelete).not.toBeNull();

    const { data: itensData } = await app
      .from("purchase_items")
      .select("id")
      .eq("purchase_id", lancada.purchase_id);
    expect((itensData ?? []).length).toBe(1);
  });

  it("cadastra produto novo pela correção e não mexe em venda já fechada", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Macarrão da correção", { stock: 0 });

    const { data: lancadaData } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Armazém",
        access_key: chaveFicticia(),
        issued_on: "2026-08-19",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Macarrão da correção",
          quantity: 5,
          unit_cost: 4,
        },
      ],
    });
    const lancada = lancadaData as ResumoCompra;

    // Vende 2 unidades: o custo da venda fica gravado como snapshot (G1).
    const { data: vendaData, error: erroVenda } = await app.rpc(
      "register_sale",
      {
        items: [
          {
            product_id: produto,
            name: "Macarrão da correção",
            unit_price: 10,
            quantity: 2,
          },
        ],
        payment_method: "dinheiro",
      },
    );
    expect(erroVenda).toBeNull();
    const saleId = vendaData as string;

    const { data: antesVenda } = await app
      .from("sale_items")
      .select("unit_cost")
      .eq("sale_id", saleId)
      .single();
    const custoDaVenda = Number(
      (antesVenda as { unit_cost: number | null }).unit_cost,
    );
    expect(custoDaVenda).toBe(4);

    // Correção: o custo era 6, e faltou um produto novo na nota.
    const { data: edicaoData, error: erroEditar } = await app.rpc(
      "editar_compra",
      {
        p_purchase_id: lancada.purchase_id,
        p_purchase: {
          supplier_name: "Armazém",
          access_key: null,
          issued_on: "2026-08-19",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Macarrão da correção",
            quantity: 5,
            unit_cost: 6,
          },
          {
            is_new: true,
            description: "Molho da correção",
            quantity: 3,
            unit_cost: 7,
            sale_price: 15,
            track_stock: true,
          },
        ],
      },
    );
    expect(erroEditar).toBeNull();
    const edicao = edicaoData as ResumoEdicao;
    expect(edicao.produtos_novos).toBe(1);
    expect(Number(edicao.total)).toBe(51);

    // O custo do macarrão sobe daqui para a frente...
    expect(Number((await lerProduto(produto)).cost_price)).toBe(6);

    // ...mas a venda já fechada continua com o custo do dia dela. Sem isso,
    // o fechamento Lucro × Custo de dias passados mudaria sozinho.
    const { data: depoisVenda } = await app
      .from("sale_items")
      .select("unit_cost")
      .eq("sale_id", saleId)
      .single();
    expect(
      Number((depoisVenda as { unit_cost: number | null }).unit_cost),
    ).toBe(4);

    const { data: novoData } = await app
      .from("products")
      .select("id, stock_quantity, cost_price, price")
      .eq("name", "Molho da correção")
      .single();
    const novo = novoData as {
      stock_quantity: number | null;
      cost_price: number | null;
      price: number;
    };
    expect(Number(novo.stock_quantity)).toBe(3);
    expect(Number(novo.cost_price)).toBe(7);
    expect(Number(novo.price)).toBe(15);
  });
});
