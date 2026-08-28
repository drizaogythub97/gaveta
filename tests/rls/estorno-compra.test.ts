import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Estorno de nota (plano 08, fase G2a.1): a RPC estornar_compra desfaz,
 * numa ÚNICA transação, tudo o que a nota causou — tira o estoque que
 * entrou, devolve o último custo ao da compra anterior, remove o gasto
 * automático em 'insumos' e marca a nota como cancelada SEM apagar o
 * histórico. Testes contra o banco real (compartilhado com o FiadoApp).
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

type ResumoEstorno = {
  purchase_id: string;
  itens_estornados: number;
  estoque_parcial: boolean;
  custos_revertidos: number;
  gasto_removido: boolean;
};

describe("RPC estornar_compra (cancelamento de nota)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("estorno");
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  /** Cria um produto do usuário de teste e devolve o id. */
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

  it("desfaz estoque, último custo e gasto, e marca a nota como cancelada", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Arroz do estorno", {
      stock: 10,
      cost: 4,
    });

    // Compra ANTERIOR (fica ativa): custo 5,00, entram 5 unidades → 15.
    const { data: anteriorData, error: erroAnterior } = await app.rpc(
      "registrar_compra",
      {
        p_purchase: {
          supplier_name: "Fornecedor Antigo",
          access_key: chaveFicticia(),
          issued_on: "2026-08-10",
          source: "manual",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Arroz do estorno",
            quantity: 5,
            unit_cost: 5,
          },
        ],
      },
    );
    expect(erroAnterior).toBeNull();
    const anterior = anteriorData as ResumoCompra;

    // Compra a ser CANCELADA: custo 6,00, entram 6 unidades → 21.
    const { data: alvoData, error: erroAlvo } = await app.rpc(
      "registrar_compra",
      {
        p_purchase: {
          supplier_name: "Fornecedor Errado",
          access_key: chaveFicticia(),
          issued_on: "2026-08-20",
          source: "manual",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Arroz do estorno",
            quantity: 6,
            unit_cost: 6,
          },
        ],
      },
    );
    expect(erroAlvo).toBeNull();
    const alvo = alvoData as ResumoCompra;
    expect(alvo.expense_id).toBeTruthy();

    const { data: antes } = await app
      .from("products")
      .select("stock_quantity, cost_price")
      .eq("id", produto)
      .single();
    expect(Number((antes as { stock_quantity: number }).stock_quantity)).toBe(
      21,
    );
    expect(Number((antes as { cost_price: number }).cost_price)).toBe(6);

    // ── O estorno ─────────────────────────────────────────────────────
    const { data: estornoData, error: erroEstorno } = await app.rpc(
      "estornar_compra",
      { p_purchase_id: alvo.purchase_id },
    );
    expect(erroEstorno).toBeNull();
    const estorno = estornoData as ResumoEstorno;
    expect(estorno.itens_estornados).toBe(1);
    expect(estorno.estoque_parcial).toBe(false);
    expect(estorno.custos_revertidos).toBe(1);
    expect(estorno.gasto_removido).toBe(true);

    // Estoque volta ao que era antes da nota cancelada.
    const { data: depois } = await app
      .from("products")
      .select("stock_quantity, cost_price")
      .eq("id", produto)
      .single();
    expect(Number((depois as { stock_quantity: number }).stock_quantity)).toBe(
      15,
    );
    // Último custo volta ao da compra ANTERIOR (que continua ativa).
    expect(Number((depois as { cost_price: number }).cost_price)).toBe(5);

    // Saída de estoque registrada como movimento 'void' (quantidade negativa).
    const { data: movs } = await app
      .from("stock_movements")
      .select("type, quantity, note")
      .eq("product_id", produto)
      .eq("type", "void");
    const movimentos = (movs ?? []) as {
      quantity: number;
      note: string | null;
    }[];
    expect(movimentos).toHaveLength(1);
    expect(Number(movimentos[0]?.quantity)).toBe(-6);
    expect(movimentos[0]?.note).toContain("Fornecedor Errado");

    // O gasto da nota cancelada sai do financeiro; o da anterior fica.
    const { count: gastoAlvo } = await app
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("id", alvo.expense_id!);
    expect(gastoAlvo ?? 0).toBe(0);
    const { count: gastoAnterior } = await app
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("id", anterior.expense_id!);
    expect(gastoAnterior).toBe(1);

    // A nota e seus itens continuam no histórico, agora marcados.
    const { data: nota } = await app
      .from("purchases")
      .select("voided_at, total, expense_id")
      .eq("id", alvo.purchase_id)
      .single();
    expect((nota as { voided_at: string | null }).voided_at).not.toBeNull();
    expect(Number((nota as { total: number }).total)).toBe(36);
    // A FK on delete set null soltou o vínculo do gasto removido.
    expect((nota as { expense_id: string | null }).expense_id).toBeNull();

    const { count: itens } = await app
      .from("purchase_items")
      .select("id", { count: "exact", head: true })
      .eq("purchase_id", alvo.purchase_id);
    expect(itens).toBe(1);
  });

  it("recusa cancelar a mesma nota duas vezes", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Item do duplo cancelamento", {
      stock: 0,
    });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor Duplo",
        access_key: null,
        issued_on: "2026-08-21",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item do duplo cancelamento",
          quantity: 3,
          unit_cost: 2,
        },
      ],
    });
    const compra = data as ResumoCompra;

    const { error: primeira } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect(primeira).toBeNull();

    const { error: segunda } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect(segunda).not.toBeNull();
    expect(segunda?.message).toContain("já foi cancelada");

    // O estoque saiu uma vez só (3 entraram, 3 saíram).
    const { data: depois } = await app
      .from("products")
      .select("stock_quantity")
      .eq("id", produto)
      .single();
    expect(Number((depois as { stock_quantity: number }).stock_quantity)).toBe(
      0,
    );
  });

  it("outro usuário não consegue cancelar a nota", async () => {
    const outro = await createTestUser("estorno-alheio");
    try {
      const app = userClient(user.accessToken);
      const alheio = userClient(outro.accessToken);
      const produto = await criarProduto("Item protegido", { stock: 0 });

      const { data } = await app.rpc("registrar_compra", {
        p_purchase: {
          supplier_name: "Fornecedor Protegido",
          access_key: null,
          issued_on: "2026-08-22",
          source: "manual",
        },
        p_itens: [
          {
            product_id: produto,
            description: "Item protegido",
            quantity: 4,
            unit_cost: 3,
          },
        ],
      });
      const compra = data as ResumoCompra;

      const { error } = await alheio.rpc("estornar_compra", {
        p_purchase_id: compra.purchase_id,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("não encontrada");

      // Nada foi tocado: nota ativa e estoque intacto.
      const { data: nota } = await app
        .from("purchases")
        .select("voided_at")
        .eq("id", compra.purchase_id)
        .single();
      expect((nota as { voided_at: string | null }).voided_at).toBeNull();
      const { data: prod } = await app
        .from("products")
        .select("stock_quantity")
        .eq("id", produto)
        .single();
      expect(Number((prod as { stock_quantity: number }).stock_quantity)).toBe(
        4,
      );
    } finally {
      await deleteTestUser(outro);
    }
  });

  it("estoque já vendido não fica negativo — sinaliza estorno parcial", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Item meio vendido", { stock: 0 });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor Parcial",
        access_key: null,
        issued_on: "2026-08-23",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item meio vendido",
          quantity: 10,
          unit_cost: 1.5,
        },
      ],
    });
    const compra = data as ResumoCompra;

    // Simula a saída de 7 unidades antes do cancelamento (restam 3).
    await app.from("products").update({ stock_quantity: 3 }).eq("id", produto);

    const { data: estornoData, error } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect(error).toBeNull();
    const estorno = estornoData as ResumoEstorno;
    expect(estorno.estoque_parcial).toBe(true);

    // products.stock_quantity tem check >= 0: saiu só o que ainda existia.
    const { data: depois } = await app
      .from("products")
      .select("stock_quantity")
      .eq("id", produto)
      .single();
    expect(Number((depois as { stock_quantity: number }).stock_quantity)).toBe(
      0,
    );

    const { data: movs } = await app
      .from("stock_movements")
      .select("quantity")
      .eq("product_id", produto)
      .eq("type", "void");
    expect(Number((movs ?? [])[0]?.quantity)).toBe(-3);
  });

  it("cancelar libera a chave de acesso para relançar a nota corrigida", async () => {
    const app = userClient(user.accessToken);
    const chave = chaveFicticia();
    const produto = await criarProduto("Item relançado", { stock: 0 });

    const payload = {
      p_purchase: {
        supplier_name: "Fornecedor Relançado",
        access_key: chave,
        issued_on: "2026-08-24",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item relançado",
          quantity: 2,
          unit_cost: 8,
        },
      ],
    };

    const { data: primeira } = await app.rpc("registrar_compra", payload);
    const errada = primeira as ResumoCompra;

    // Enquanto a nota está ativa, a mesma chave é recusada.
    const { error: duplicada } = await app.rpc("registrar_compra", payload);
    expect(duplicada).not.toBeNull();

    // Depois de cancelada, a chave volta a ser aceita (a nota certa entra).
    const { error: erroEstorno } = await app.rpc("estornar_compra", {
      p_purchase_id: errada.purchase_id,
    });
    expect(erroEstorno).toBeNull();

    const { data: segunda, error: erroSegunda } = await app.rpc(
      "registrar_compra",
      payload,
    );
    expect(erroSegunda).toBeNull();
    const certa = segunda as ResumoCompra;
    expect(certa.purchase_id).not.toBe(errada.purchase_id);

    // Duas notas com a mesma chave: uma cancelada e uma ativa.
    const { data: notas } = await app
      .from("purchases")
      .select("id, voided_at")
      .eq("access_key", chave);
    const linhas = (notas ?? []) as { voided_at: string | null }[];
    expect(linhas).toHaveLength(2);
    expect(linhas.filter((n) => n.voided_at === null)).toHaveLength(1);
  });

  it("nota é histórico: alterar campos ou cancelar por fora é recusado", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Item imutável", { stock: 0 });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor Imutável",
        access_key: null,
        issued_on: "2026-08-25",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item imutável",
          quantity: 5,
          unit_cost: 4,
        },
      ],
    });
    const compra = data as ResumoCompra;

    // Mexer em campo de histórico: recusado pelo trigger.
    const { error: erroTotal } = await app
      .from("purchases")
      .update({ total: 1 })
      .eq("id", compra.purchase_id);
    expect(erroTotal).not.toBeNull();

    // Marcar como cancelada por fora da RPC: recusado — senão a nota
    // ficaria "cancelada" com estoque e gasto intactos.
    const { error: erroVoid } = await app
      .from("purchases")
      .update({ voided_at: new Date().toISOString() })
      .eq("id", compra.purchase_id);
    expect(erroVoid).not.toBeNull();

    const { data: nota } = await app
      .from("purchases")
      .select("total, voided_at")
      .eq("id", compra.purchase_id)
      .single();
    expect(Number((nota as { total: number }).total)).toBe(20);
    expect((nota as { voided_at: string | null }).voided_at).toBeNull();
  });

  it("respeita o custo digitado à mão depois da nota", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Item de custo manual", { stock: 0 });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor do Custo",
        access_key: null,
        issued_on: "2026-08-26",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item de custo manual",
          quantity: 1,
          unit_cost: 7,
        },
      ],
    });
    const compra = data as ResumoCompra;

    // O dono corrigiu o custo à mão depois de lançar a nota.
    await app.from("products").update({ cost_price: 9.9 }).eq("id", produto);

    const { data: estornoData } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect((estornoData as ResumoEstorno).custos_revertidos).toBe(0);

    const { data: depois } = await app
      .from("products")
      .select("cost_price")
      .eq("id", produto)
      .single();
    expect(Number((depois as { cost_price: number }).cost_price)).toBe(9.9);
  });

  it("sem compra anterior, o custo do produto fica como está", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Item sem histórico", { stock: 0 });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: "Fornecedor Único",
        access_key: null,
        issued_on: "2026-08-26",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Item sem histórico",
          quantity: 2,
          unit_cost: 3.5,
        },
      ],
    });
    const compra = data as ResumoCompra;

    const { data: estornoData, error } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect(error).toBeNull();
    expect((estornoData as ResumoEstorno).custos_revertidos).toBe(0);

    // Não há custo anterior conhecido: o valor da nota permanece (não vira
    // nulo nem some), e o estoque volta a zero.
    const { data: depois } = await app
      .from("products")
      .select("cost_price, stock_quantity")
      .eq("id", produto)
      .single();
    expect(Number((depois as { cost_price: number }).cost_price)).toBe(3.5);
    expect(Number((depois as { stock_quantity: number }).stock_quantity)).toBe(
      0,
    );
  });

  it("produto sob demanda: cancela o custo/gasto sem movimentar estoque", async () => {
    const app = userClient(user.accessToken);
    const produto = await criarProduto("Marmita cancelada", { track: false });

    const { data } = await app.rpc("registrar_compra", {
      p_purchase: {
        supplier_name: null,
        access_key: null,
        issued_on: "2026-08-26",
        source: "manual",
      },
      p_itens: [
        {
          product_id: produto,
          description: "Marmita cancelada",
          quantity: 4,
          unit_cost: 12.5,
        },
      ],
    });
    const compra = data as ResumoCompra;

    const { data: estornoData, error } = await app.rpc("estornar_compra", {
      p_purchase_id: compra.purchase_id,
    });
    expect(error).toBeNull();
    const estorno = estornoData as ResumoEstorno;
    expect(estorno.itens_estornados).toBe(1);
    expect(estorno.gasto_removido).toBe(true);

    // Quem não controla estoque não gera movimento nem antes nem depois.
    const { count: movs } = await app
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("product_id", produto);
    expect(movs ?? 0).toBe(0);

    const { data: depois } = await app
      .from("products")
      .select("stock_quantity")
      .eq("id", produto)
      .single();
    expect(
      (depois as { stock_quantity: number | null }).stock_quantity,
    ).toBeNull();
  });
});
