import { describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, userClient } from "./helpers";
import type { TestUser } from "./helpers";

/**
 * Fechamento Lucro × Custo (plano 08, seção 2 — fase G3).
 *
 * A pergunta do dono: do dinheiro que ENTROU, quanto é custo (recompor a
 * mercadoria) e quanto é lucro. Cada teste roda com o SEU usuário
 * descartável, porque as funções agregam tudo do usuário no período.
 */

/** Janela larga em volta de agora, para pegar o que o teste acabou de criar. */
const DE = new Date(Date.now() - 3_600_000).toISOString();
const ATE = new Date(Date.now() + 3_600_000).toISOString();

type Resumo = {
  recebido_vista: number;
  taxas: number;
  custo_vista: number;
  base_vista: number;
  base_coberta_vista: number;
  recebido_fiado: number;
  custo_fiado: number;
  base_fiado: number;
  base_coberta_fiado: number;
};

const ZERO: Resumo = {
  recebido_vista: 0,
  taxas: 0,
  custo_vista: 0,
  base_vista: 0,
  base_coberta_vista: 0,
  recebido_fiado: 0,
  custo_fiado: 0,
  base_fiado: 0,
  base_coberta_fiado: 0,
};

/** Números como o app vai apresentá-los. */
function fechamento(r: Resumo) {
  const recebido = Number(r.recebido_vista) + Number(r.recebido_fiado);
  const taxas = Number(r.taxas);
  const custo = Number(r.custo_vista) + Number(r.custo_fiado);
  const base = Number(r.base_vista) + Number(r.base_fiado);
  const coberta = Number(r.base_coberta_vista) + Number(r.base_coberta_fiado);
  return {
    recebido: Math.round(recebido * 100) / 100,
    taxas,
    custo: Math.round(custo * 100) / 100,
    lucro: Math.round((recebido - taxas - custo) * 100) / 100,
    cobertura: base > 0 ? Math.round((coberta / base) * 100) / 100 : 1,
  };
}

async function resumo(
  app: ReturnType<typeof userClient>,
  methods: string[] | null = null,
): Promise<Resumo> {
  const { data, error } = await app
    .rpc("lucro_custo_summary", { p_from: DE, p_to: ATE, p_methods: methods })
    .maybeSingle();
  expect(error).toBeNull();
  return (data ?? ZERO) as Resumo;
}

async function criarProduto(
  app: ReturnType<typeof userClient>,
  user: TestUser,
  nome: string,
  preco: number,
  custo: number | null,
): Promise<string> {
  const { data, error } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: nome,
      price: preco,
      cost_price: custo,
      track_stock: true,
      stock_quantity: 100,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
  return (data as { id: string }).id;
}

describe("RPC lucro_custo_summary (fechamento do dia)", () => {
  it("separa custo e lucro de uma venda à vista", async () => {
    const user = await createTestUser("lucro-vista");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);
      const feijao = await criarProduto(app, user, "Feijão", 20, 7);

      const { error } = await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 2 },
          { product_id: feijao, name: "Feijão", unit_price: 20, quantity: 1 },
        ],
        payment_method: "dinheiro",
      });
      expect(error).toBeNull();

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(40); // 2×10 + 1×20
      expect(r.custo).toBe(15); // 2×4 + 1×7
      expect(r.lucro).toBe(25);
      expect(r.cobertura).toBe(1); // todo item tinha custo
    } finally {
      await deleteTestUser(user);
    }
  });

  it("desconta a taxa do LUCRO, nunca do custo", async () => {
    const user = await createTestUser("lucro-taxa");
    try {
      const app = userClient(user.accessToken);
      const feijao = await criarProduto(app, user, "Feijão", 20, 7);

      const { error } = await app.rpc("register_sale", {
        items: [
          { product_id: feijao, name: "Feijão", unit_price: 20, quantity: 1 },
        ],
        payment_method: "credito_avista",
        fee_amount: 2,
      });
      expect(error).toBeNull();

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(20);
      expect(r.taxas).toBe(2);
      // O custo de recompra é intocável: continua 7, e a taxa sai do lucro.
      expect(r.custo).toBe(7);
      expect(r.lucro).toBe(11);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("o desconto sai do lucro e não encolhe o custo", async () => {
    const user = await createTestUser("lucro-desconto");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);

      const { error } = await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 3 },
        ],
        payment_method: "dinheiro",
        discount_amount: 6,
      });
      expect(error).toBeNull();

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(24); // 30 − 6 de desconto
      expect(r.custo).toBe(12); // 3 × 4, inalterado
      expect(r.lucro).toBe(12);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("item sem custo não entra no split e derruba a cobertura", async () => {
    const user = await createTestUser("lucro-sem-custo");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);
      const bolo = await criarProduto(app, user, "Bolo caseiro", 30, null);

      const { error } = await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 1 },
          {
            product_id: bolo,
            name: "Bolo caseiro",
            unit_price: 30,
            quantity: 1,
          },
        ],
        payment_method: "dinheiro",
      });
      expect(error).toBeNull();

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(40);
      // Só o arroz tem custo conhecido — o bolo é sinalizado, não chutado.
      expect(r.custo).toBe(4);
      expect(r.cobertura).toBe(0.25); // 10 de 40

      // E o bolo aparece na lista do "informar custo agora".
      const { data: lista, error: erroLista } = await app.rpc(
        "produtos_sem_custo",
        { p_from: DE, p_to: ATE, p_methods: null },
      );
      expect(erroLista).toBeNull();
      const linhas = (lista ?? []) as {
        product_id: string | null;
        nome: string | null;
        valor: number;
      }[];
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.product_id).toBe(bolo);
      expect(linhas[0]?.nome).toBe("Bolo caseiro");
      expect(Number(linhas[0]?.valor)).toBe(30);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("item avulso aparece na lista sem produto para corrigir", async () => {
    const user = await createTestUser("lucro-avulso");
    try {
      const app = userClient(user.accessToken);

      const { error } = await app.rpc("register_sale", {
        items: [
          {
            product_id: null,
            name: "Item avulso",
            unit_price: 15,
            quantity: 1,
          },
        ],
        payment_method: "dinheiro",
      });
      expect(error).toBeNull();

      const { data: lista } = await app.rpc("produtos_sem_custo", {
        p_from: DE,
        p_to: ATE,
        p_methods: null,
      });
      const linhas = (lista ?? []) as {
        product_id: string | null;
        nome: string | null;
        valor: number;
      }[];
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.product_id).toBeNull();
      expect(linhas[0]?.nome).toBeNull(); // a tela mostra rótulo genérico
      expect(Number(linhas[0]?.valor)).toBe(15);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("venda estornada sai do fechamento", async () => {
    const user = await createTestUser("lucro-estorno");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);

      const { data: vendaId } = await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 2 },
        ],
        payment_method: "dinheiro",
      });

      expect(fechamento(await resumo(app)).recebido).toBe(20);

      await app.rpc("set_sale_status", {
        p_sale_id: vendaId as unknown as string,
        p_status: "voided",
      });

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(0);
      expect(r.custo).toBe(0);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("filtro por forma de pagamento recorta o caixa", async () => {
    const user = await createTestUser("lucro-formas");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);

      await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 1 },
        ],
        payment_method: "dinheiro",
      });
      await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 3 },
        ],
        payment_method: "pix",
      });

      expect(fechamento(await resumo(app)).recebido).toBe(40);
      expect(fechamento(await resumo(app, ["pix"])).recebido).toBe(30);
      expect(fechamento(await resumo(app, ["dinheiro"])).custo).toBe(4);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("um usuário não vê o fechamento do outro", async () => {
    const user = await createTestUser("lucro-dono");
    const outro = await createTestUser("lucro-alheio");
    try {
      const app = userClient(user.accessToken);
      const alheio = userClient(outro.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);

      await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 5 },
        ],
        payment_method: "dinheiro",
      });

      expect(fechamento(await resumo(app)).recebido).toBe(50);
      expect(fechamento(await resumo(alheio)).recebido).toBe(0);
    } finally {
      await deleteTestUser(user);
      await deleteTestUser(outro);
    }
  });
});

/**
 * Regra do fiado (decisão 6): a venda a prazo NÃO entra no dia da venda —
 * entra no dia de cada quitação, rateando custo e lucro pelo que foi pago.
 */
describe("fechamento e a venda a prazo (FiadoApp)", () => {
  /** Cria uma venda a prazo pela RPC-ponte e devolve os dois ids. */
  async function venderAPrazo(
    app: ReturnType<typeof userClient>,
    user: TestUser,
    produto: string,
    precoUnitario: number,
    quantidade: number,
  ): Promise<{ vendaFiadoId: string; saleId: string }> {
    await app.from("ecossistema_prefs").upsert({
      user_id: user.id,
      fiado_pdv_ativo: true,
      updated_at: new Date().toISOString(),
    });

    const total = precoUnitario * quantidade;
    const { data, error } = await app.rpc("registrar_venda_fiado", {
      p_items: [
        {
          product_id: produto,
          name: "Arroz",
          unit_price: precoUnitario,
          quantity: quantidade,
        },
      ],
      p_itens_fiado: [
        {
          descricao: `${quantidade} x Arroz`,
          quantidade: 1,
          valor_unitario: total,
        },
      ],
      p_cliente_id: null,
      p_cliente: {
        nome: "Cliente",
        sobrenome: "Fechamento",
        referencia: "Balcão",
        telefone: null,
      },
      p_data_vencimento: null,
      p_observacao: null,
    });
    expect(error).toBeNull();
    const ids = data as { venda_id: string; sale_id: string };
    return { vendaFiadoId: ids.venda_id, saleId: ids.sale_id };
  }

  it("não entra no dia da venda — só quando o cliente paga", async () => {
    const user = await createTestUser("lucro-fiado-venda");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);
      await venderAPrazo(app, user, arroz, 10, 2);

      // Vendeu, baixou estoque, mas nada entrou no caixa ainda.
      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(0);
      expect(r.custo).toBe(0);
      expect(r.lucro).toBe(0);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("pagamento parcial rateia custo e lucro proporcionalmente", async () => {
    const user = await createTestUser("lucro-fiado-parcial");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);
      const { vendaFiadoId } = await venderAPrazo(app, user, arroz, 10, 2);

      // Venda de R$ 20 (custo total R$ 8). Cliente paga metade.
      const { error } = await app.from("fiado_pagamentos").insert({
        user_id: user.id,
        venda_id: vendaFiadoId,
        valor_pago: 10,
        pago_em: new Date().toISOString(),
      });
      expect(error).toBeNull();

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(10);
      expect(r.custo).toBe(4); // metade dos R$ 8 de custo
      expect(r.lucro).toBe(6);
      expect(r.cobertura).toBe(1);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("as parcelas somadas fecham exatamente o total da venda", async () => {
    const user = await createTestUser("lucro-fiado-total");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);
      const { vendaFiadoId } = await venderAPrazo(app, user, arroz, 10, 3);

      // R$ 30 no total (custo R$ 12), pagos em três parcelas.
      for (const valor of [10, 10, 10]) {
        const { error } = await app.from("fiado_pagamentos").insert({
          user_id: user.id,
          venda_id: vendaFiadoId,
          valor_pago: valor,
          pago_em: new Date().toISOString(),
        });
        expect(error).toBeNull();
      }

      const r = fechamento(await resumo(app));
      expect(r.recebido).toBe(30);
      expect(r.custo).toBe(12); // o rateio não perde nem inventa centavo
      expect(r.lucro).toBe(18);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("com filtro de forma de pagamento, o a prazo fica de fora", async () => {
    const user = await createTestUser("lucro-fiado-filtro");
    try {
      const app = userClient(user.accessToken);
      const arroz = await criarProduto(app, user, "Arroz", 10, 4);

      await app.rpc("register_sale", {
        items: [
          { product_id: arroz, name: "Arroz", unit_price: 10, quantity: 1 },
        ],
        payment_method: "dinheiro",
      });
      const { vendaFiadoId } = await venderAPrazo(app, user, arroz, 10, 2);
      await app.from("fiado_pagamentos").insert({
        user_id: user.id,
        venda_id: vendaFiadoId,
        valor_pago: 20,
        pago_em: new Date().toISOString(),
      });

      // Sem filtro: caixa + recebido a prazo.
      expect(fechamento(await resumo(app)).recebido).toBe(30);
      // Filtrando "dinheiro": só o caixa daquela forma.
      expect(fechamento(await resumo(app, ["dinheiro"])).recebido).toBe(10);
    } finally {
      await deleteTestUser(user);
    }
  });
});
