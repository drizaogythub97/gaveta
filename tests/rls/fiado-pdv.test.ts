import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Ponte "Fiado no PDV" (Ecossistema F6, Fase 1): a RPC registrar_venda_fiado
 * cria, numa única transação, o a-receber no FiadoApp e a venda 'fiado' no
 * Gaveta (com vínculo e origem), atomicamente. Testes contra o banco real
 * compartilhado.
 */
describe("RPC registrar_venda_fiado (ponte Fiado no PDV)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("fiado-pdv");
    // Liga a ponte (opt-in) para este usuário.
    const app = userClient(user.accessToken);
    await app.from("ecossistema_prefs").upsert({
      user_id: user.id,
      fiado_pdv_ativo: true,
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  it("cria a-receber no FiadoApp + venda 'fiado' no Gaveta, vinculadas", async () => {
    const app = userClient(user.accessToken);

    // Item fracionado (1,5 × 4 = 6) + inteiro (2 × 10 = 20) → total 26.
    const pItems = [
      { product_id: null, name: "Tomate", unit_price: 4, quantity: 1.5 },
      { product_id: null, name: "Arroz", unit_price: 10, quantity: 2 },
    ];
    const pItensFiado = [
      { descricao: "1,5 × Tomate", quantidade: 1, valor_unitario: 6 },
      { descricao: "2 × Arroz", quantidade: 1, valor_unitario: 20 },
    ];

    const { data, error } = await app.rpc("registrar_venda_fiado", {
      p_items: pItems,
      p_itens_fiado: pItensFiado,
      p_cliente_id: null,
      p_cliente: {
        nome: "Cliente",
        sobrenome: "Do Caixa",
        referencia: "Balcão",
        telefone: "11999998888",
      },
      p_data_vencimento: null,
      p_observacao: null,
    });
    expect(error).toBeNull();
    const { venda_id, sale_id } = data as {
      venda_id: string;
      sale_id: string;
    };
    expect(venda_id).toBeTruthy();
    expect(sale_id).toBeTruthy();

    // ── Lado FiadoApp: a-receber criado, origem 'gaveta', total exato ──
    const { data: venda } = await app
      .from("fiado_vendas")
      .select("valor_total, valor_pago, status, origem, cliente_id, data_vencimento")
      .eq("id", venda_id)
      .single();
    expect(venda?.valor_total).toBe(26);
    expect(venda?.valor_pago).toBe(0);
    expect(venda?.status).toBe("ATIVA");
    expect(venda?.origem).toBe("gaveta");
    expect(venda?.data_vencimento).toBeTruthy(); // +30d default

    // Cliente novo criado com telefone (para cobrança no WhatsApp).
    const { data: cliente } = await app
      .from("fiado_clientes")
      .select("nome, sobrenome, referencia, telefone")
      .eq("id", venda?.cliente_id)
      .single();
    expect(cliente?.nome).toBe("Cliente");
    expect(cliente?.telefone).toBe("11999998888");

    // Item fracionado preservou o valor com a quantidade na descrição.
    const { data: itens } = await app
      .from("fiado_itens_venda")
      .select("descricao, valor_total")
      .eq("venda_id", venda_id)
      .order("descricao", { ascending: true });
    const tomate = itens?.find((i) => i.descricao.includes("Tomate"));
    expect(tomate?.descricao).toContain("1,5 ×");
    expect(tomate?.valor_total).toBe(6);

    // ── Lado Gaveta: venda 'fiado', vinculada, fora do caixa ──────────
    const { data: sale } = await app
      .from("sales")
      .select("total, payment_method, fiado_venda_id, cash_session_id")
      .eq("id", sale_id)
      .single();
    expect(sale?.total).toBe(26);
    expect(sale?.payment_method).toBe("fiado");
    expect(sale?.fiado_venda_id).toBe(venda_id);
    expect(sale?.cash_session_id).toBeNull(); // não entra no fechamento
  });

  it("recusa a venda a prazo quando a ponte está desativada", async () => {
    const outro = await createTestUser("fiado-pdv-off");
    try {
      const app = userClient(outro.accessToken);
      const { error } = await app.rpc("registrar_venda_fiado", {
        p_items: [
          { product_id: null, name: "X", unit_price: 5, quantity: 1 },
        ],
        p_itens_fiado: [
          { descricao: "X", quantidade: 1, valor_unitario: 5 },
        ],
        p_cliente_id: null,
        p_cliente: { nome: "Alguém", sobrenome: null, referencia: null, telefone: null },
        p_data_vencimento: null,
        p_observacao: null,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("desativada");
    } finally {
      await deleteTestUser(outro);
    }
  });
});
