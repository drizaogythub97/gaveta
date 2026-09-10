import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * O que o BANCO garante na venda (achados C, D e F da varredura de 10/09,
 * migration 0023 — ver `docs/10-ACHADOS-DE-LOGICA.md`).
 *
 * C. A taxa vinha do navegador e era gravada como veio. O Fechamento
 *    desconta essa taxa do LUCRO, então bastava a tela estar desatualizada
 *    para o lucro sair errado sem nada denunciar. A RLS não protege contra
 *    isso: o dado é do próprio usuário. O teste que importa aqui é o que
 *    manda um valor MENTIROSO e confere que o banco o ignora.
 *
 * D. O estoque era cortado em zero enquanto o movimento gravava a
 *    quantidade cheia, e a razão deixava de reconstruir o saldo.
 *
 * F. O número de parcelas tinha três limites diferentes.
 *
 * Um usuário descartável para o arquivo inteiro: a suíte de RLS já roda no
 * limite do rate limit do Supabase (34 usuários medidos).
 */
describe("regras da venda que moram no banco", () => {
  let user: TestUser;
  let app: ReturnType<typeof userClient>;

  beforeAll(async () => {
    user = await createTestUser("venda-banco");
    app = userClient(user.accessToken);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  async function novoProduto(
    name: string,
    price: number,
    estoque: number,
  ): Promise<string> {
    const { data, error } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name,
        price,
        track_stock: true,
        stock_quantity: estoque,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  async function vender(
    produtoId: string,
    preco: number,
    qtd: number,
    metodo: string,
    extras: {
      installments?: number | null;
      fee_amount?: number;
      discount_amount?: number;
    } = {},
  ) {
    return app.rpc("register_sale", {
      items: [
        { product_id: produtoId, name: "item", unit_price: preco, quantity: qtd },
      ],
      payment_method: metodo,
      installments: extras.installments ?? null,
      fee_amount: extras.fee_amount ?? 0,
      discount_amount: extras.discount_amount ?? 0,
    });
  }

  async function vendaGravada(saleId: string) {
    const { data } = await app
      .from("sales")
      .select("total, fee_amount, discount_amount, installments")
      .eq("id", saleId)
      .single();
    return data as {
      total: number;
      fee_amount: number;
      discount_amount: number;
      installments: number | null;
    };
  }

  // ------------------------------------------------------------------
  // C — a taxa é do banco, não do navegador
  // ------------------------------------------------------------------

  it("sem taxa cadastrada, a venda no cartão sai com taxa zero", async () => {
    const p = await novoProduto("Zbanco sem taxa", 50, 100);
    const { data: saleId, error } = await vender(p, 50, 2, "credito_avista");
    expect(error).toBeNull();

    const venda = await vendaGravada(saleId as string);
    expect(Number(venda.total)).toBe(100);
    expect(Number(venda.fee_amount)).toBe(0);
  });

  it("com taxa cadastrada, o BANCO calcula — mesmo que a tela não mande nada", async () => {
    const { error: erroPrefs } = await app.from("preferences_fees").upsert({
      user_id: user.id,
      pix_pct: 1,
      debito_pct: 2,
      credito_avista_pct: 3.5,
      credito_parcelado_base_pct: 4,
      credito_parcelado_por_parcela_pct: 1.5,
      vale_pct: 5,
    });
    expect(erroPrefs).toBeNull();

    const p = await novoProduto("Zbanco com taxa", 100, 100);
    // A Server Action não manda mais `fee_amount`; aqui vai o default 0.
    const { data: saleId, error } = await vender(p, 100, 2, "credito_avista");
    expect(error).toBeNull();

    const venda = await vendaGravada(saleId as string);
    expect(Number(venda.total)).toBe(200);
    expect(Number(venda.fee_amount)).toBe(7); // 3,5% de 200
  });

  it("MENTIRA do cliente é ignorada — era exatamente o buraco do achado C", async () => {
    const p = await novoProduto("Zbanco taxa forjada", 100, 100);
    const { data: saleId, error } = await vender(p, 100, 2, "credito_avista", {
      fee_amount: 999,
    });
    expect(error).toBeNull();

    const venda = await vendaGravada(saleId as string);
    // Antes, o 999 entraria inteiro e o Fechamento tiraria isso do lucro.
    expect(Number(venda.fee_amount)).toBe(7);
  });

  it("a taxa incide sobre o total JÁ com desconto, como a tela mostra", async () => {
    const p = await novoProduto("Zbanco taxa com desconto", 100, 100);
    const { data: saleId, error } = await vender(p, 100, 2.5, "credito_avista", {
      discount_amount: 50,
    });
    expect(error).toBeNull();

    const venda = await vendaGravada(saleId as string);
    expect(Number(venda.total)).toBe(200); // 250 − 50
    expect(Number(venda.fee_amount)).toBe(7); // 3,5% de 200, não de 250
  });

  it("parcelado soma base + adicional por parcela", async () => {
    const p = await novoProduto("Zbanco parcelado", 100, 100);
    const { data: saleId, error } = await vender(p, 100, 2, "credito_parcelado", {
      installments: 6,
    });
    expect(error).toBeNull();

    const venda = await vendaGravada(saleId as string);
    // 4% + 5 × 1,5% = 11,5% de 200
    expect(Number(venda.fee_amount)).toBe(23);
    expect(venda.installments).toBe(6);
  });

  it("dinheiro e venda a prazo não têm taxa de cartão", async () => {
    const p = await novoProduto("Zbanco dinheiro", 100, 100);
    const { data: saleId, error } = await vender(p, 100, 2, "dinheiro");
    expect(error).toBeNull();
    expect(Number((await vendaGravada(saleId as string)).fee_amount)).toBe(0);
  });

  // ------------------------------------------------------------------
  // D — o saldo pode ficar negativo, e a razão volta a fechar
  // ------------------------------------------------------------------

  it("vender mais do que existe deixa o saldo NEGATIVO, não zerado", async () => {
    const p = await novoProduto("Zbanco estoque curto", 10, 3);
    const { error } = await vender(p, 10, 5, "dinheiro");
    expect(error).toBeNull();

    const { data } = await app
      .from("products")
      .select("stock_quantity")
      .eq("id", p)
      .single();
    // Antes: 0, com um movimento de −5 que ninguém conseguia conciliar.
    expect(Number((data as { stock_quantity: number }).stock_quantity)).toBe(-2);
  });

  it("somar a razão dá exatamente o saldo — era isso que se perdia", async () => {
    const p = await novoProduto("Zbanco razao fecha", 10, 4);
    expect((await vender(p, 10, 3, "dinheiro")).error).toBeNull();
    expect((await vender(p, 10, 6, "dinheiro")).error).toBeNull();

    const { data: movs } = await app
      .from("stock_movements")
      .select("quantity")
      .eq("product_id", p);
    const somaDaRazao = (movs ?? []).reduce(
      (s, m) => s + Number((m as { quantity: number }).quantity),
      0,
    );

    const { data: prod } = await app
      .from("products")
      .select("stock_quantity")
      .eq("id", p)
      .single();
    const saldo = Number((prod as { stock_quantity: number }).stock_quantity);

    // 4 de entrada não gera movimento (nasce no cadastro), então a razão
    // soma −9 e o saldo é 4 − 9 = −5.
    expect(somaDaRazao).toBe(-9);
    expect(saldo).toBe(-5);
    expect(4 + somaDaRazao).toBe(saldo);
  });

  // ------------------------------------------------------------------
  // F — um limite só para as parcelas
  // ------------------------------------------------------------------

  it("recusa 24 parcelas, que a Server Action antiga aceitava", async () => {
    const p = await novoProduto("Zbanco 24x", 100, 100);
    const { error } = await vender(p, 100, 1, "credito_parcelado", {
      installments: 24,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("parcelas");
  });

  it("recusa 1 parcela, que o banco antigo aceitava", async () => {
    const p = await novoProduto("Zbanco 1x", 100, 100);
    const { error } = await vender(p, 100, 1, "credito_parcelado", {
      installments: 1,
    });
    expect(error).not.toBeNull();
  });

  it("aceita o teto de 12, que é o que a tela oferece", async () => {
    const p = await novoProduto("Zbanco 12x", 100, 100);
    const { data: saleId, error } = await vender(
      p,
      100,
      1,
      "credito_parcelado",
      { installments: 12 },
    );
    expect(error).toBeNull();
    expect((await vendaGravada(saleId as string)).installments).toBe(12);
  });
});
