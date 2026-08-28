import { test as setup, expect } from "@playwright/test";

import { STATE_FUNCIONAL, STATE_VISUAL } from "../../playwright.config";

import {
  createTestUser,
  dispensarAvisos,
  loginPelaUI,
  saveUsers,
  userClient,
} from "./helpers";

/**
 * Prepara as contas DESCARTÁVEIS do e2e (protocolo docs/09 §1) e guarda a
 * sessão de cada uma. O projeto `cleanup` apaga as duas no fim.
 */
setup("cria usuários descartáveis e faz login", async ({ browser }) => {
  const funcional = await createTestUser("e2e-func");
  const visual = await createTestUser("e2e-visu");

  // ── Estado FIXO do usuário visual: uma nota já lançada, com valores
  //    escolhidos a dedo para o screenshot não variar entre execuções.
  const app = userClient(visual.accessToken);
  const { data: seed, error: seedError } = await app.rpc("registrar_compra", {
    p_purchase: {
      supplier_name: "Distribuidora Modelo",
      access_key: null,
      issued_on: "2026-08-20",
      source: "manual",
    },
    p_itens: [
      {
        is_new: true,
        description: "Café torrado 500g",
        barcode: "7890000000017",
        quantity: 10,
        unit_cost: 9.9,
        sale_price: 16.5,
        track_stock: true,
      },
    ],
  });
  expect(seedError).toBeNull();
  const visualPurchaseId = (seed as { purchase_id: string }).purchase_id;

  // ── Segunda nota semeada, JÁ CANCELADA (G2a.1): dá um estado estável
  //    para a verificação visual do selo "Cancelada" e da tela de detalhe
  //    de uma nota estornada.
  const { data: seedVoid, error: seedVoidError } = await app.rpc(
    "registrar_compra",
    {
      p_purchase: {
        supplier_name: "Fornecedor Cancelado",
        access_key: null,
        issued_on: "2026-08-18",
        source: "manual",
      },
      p_itens: [
        {
          is_new: true,
          description: "Chá de camomila 20g",
          quantity: 5,
          unit_cost: 4.4,
          sale_price: 8.5,
          track_stock: true,
        },
      ],
    },
  );
  expect(seedVoidError).toBeNull();
  const visualVoidedPurchaseId = (seedVoid as { purchase_id: string })
    .purchase_id;

  const { error: voidError } = await app.rpc("estornar_compra", {
    p_purchase_id: visualVoidedPurchaseId,
  });
  expect(voidError).toBeNull();

  // ── Vendas semeadas do usuário visual (G3): valores escolhidos para a
  //    tela de fechamento mostrar o estado mais informativo — o split de
  //    recompra × lucro E o aviso de cobertura incompleta.
  //    O café veio da nota semeada acima, com custo de R$ 9,90.
  const { data: cafe } = await app
    .from("products")
    .select("id")
    .eq("name", "Café torrado 500g")
    .single();
  const cafeId = (cafe as { id: string }).id;

  const { data: bolo, error: boloError } = await app
    .from("products")
    .insert({
      user_id: visual.id,
      name: "Bolo caseiro",
      price: 30,
      cost_price: null, // de propósito: é ele que derruba a cobertura
      track_stock: true,
      stock_quantity: 10,
    })
    .select("id")
    .single();
  expect(boloError).toBeNull();

  const { error: vendaCafeError } = await app.rpc("register_sale", {
    items: [
      {
        product_id: cafeId,
        name: "Café torrado 500g",
        unit_price: 16.5,
        quantity: 2,
      },
    ],
    payment_method: "dinheiro",
  });
  expect(vendaCafeError).toBeNull();

  const { error: vendaBoloError } = await app.rpc("register_sale", {
    items: [
      {
        product_id: (bolo as { id: string }).id,
        name: "Bolo caseiro",
        unit_price: 30,
        quantity: 1,
      },
    ],
    payment_method: "dinheiro",
  });
  expect(vendaBoloError).toBeNull();

  saveUsers({ funcional, visual, visualPurchaseId, visualVoidedPurchaseId });

  for (const [user, state] of [
    [funcional, STATE_FUNCIONAL],
    [visual, STATE_VISUAL],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginPelaUI(page, user);
    await dispensarAvisos(page);
    await context.storageState({ path: state });
    await context.close();
  }
});
