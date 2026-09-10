import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { hojeISO, loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Validação do H1 — corrigir uma nota já lançada (protocolo docs/09 §1 e §2).
 *
 * O lançamento e o cancelamento já têm o seu arquivo (compras.spec.ts). Aqui
 * o que se exercita é a CORREÇÃO: a tela pré-preenchida, o resumo que compara
 * o valor antigo com o novo e — no banco — o acerto do estoque pela
 * diferença, do último custo e do gasto no Financeiro. O layout e os alvos
 * de toque da tela de correção ficam em compras-visual.spec.ts, que é quem
 * roda também no celular.
 *
 * As notas deste arquivo nascem pela RPC (é montagem de cenário, não o que
 * está sendo testado) e os produtos criados aqui são apagados no fim, porque
 * outros arquivos contam o catálogo.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PRODUTO = "Zcorrige e2e Arroz";
const FORNECEDOR = "Correcao E2E";
const FORNECEDOR_CERTO = "Correcao E2E Certo";

let user: TestUser;
let app: SupabaseClient;
let produtoId: string;
let notaId: string;
let notaCanceladaId: string;

/** Blocos da tela de nota (os mesmos do lançamento). */
const sel = {
  itens: 'section[aria-labelledby="nota-itens"]',
};

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: PRODUTO,
      price: 25,
      cost_price: 4,
      track_stock: true,
      stock_quantity: 0,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  produtoId = (data as { id: string }).id;

  // A nota a corrigir: 10 unidades a R$ 5,00 = R$ 50,00.
  const { data: notaData, error: erroNota } = await app.rpc(
    "registrar_compra",
    {
      p_purchase: {
        supplier_name: FORNECEDOR,
        issued_on: hojeISO(),
        source: "manual",
      },
      p_itens: [
        {
          product_id: produtoId,
          description: PRODUTO,
          quantity: 10,
          unit_cost: 5,
        },
      ],
    },
  );
  expect(erroNota).toBeNull();
  notaId = (notaData as { purchase_id: string }).purchase_id;

  // Uma segunda nota, cancelada, para provar que ela não oferece correção.
  const { data: outraData } = await app.rpc("registrar_compra", {
    p_purchase: {
      supplier_name: "Correcao E2E Cancelada",
      issued_on: hojeISO(),
      source: "manual",
    },
    p_itens: [
      {
        product_id: produtoId,
        description: PRODUTO,
        quantity: 1,
        unit_cost: 5,
      },
    ],
  });
  notaCanceladaId = (outraData as { purchase_id: string }).purchase_id;
  const { error: erroEstorno } = await app.rpc("estornar_compra", {
    p_purchase_id: notaCanceladaId,
  });
  expect(erroEstorno).toBeNull();
});

test.afterAll(async () => {
  // Outros arquivos contam o catálogo: o que este criou sai daqui.
  if (produtoId) {
    await app.from("products").delete().eq("id", produtoId);
  }
  await app.from("products").delete().eq("name", "Zcorrige e2e Molho");
});

test("1. a nota lançada oferece corrigir, e a tela vem preenchida", async ({
  page,
}) => {
  await page.goto(`/estoque/compras/${notaId}`);
  await page.getByRole("link", { name: "Corrigir nota" }).click();

  await expect(page).toHaveURL(new RegExp(`/estoque/compras/${notaId}/editar`));
  await expect(
    page.getByRole("heading", { name: "Corrigir nota" }),
  ).toBeVisible();

  // Cabeçalho e itens chegam com o que está gravado — corrigir é ajustar o
  // que já existe, não digitar tudo de novo.
  await expect(page.locator("#supplier")).toHaveValue(FORNECEDOR);
  await expect(page.locator("#issuedOn")).toHaveValue(hojeISO());
  const linha = page.locator(`${sel.itens} li`).first();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(1);
  await expect(linha.getByText(PRODUTO)).toBeVisible();
  await expect(linha.getByLabel("Quantidade")).toHaveValue("10");
  await expect(linha.getByLabel("Custo por unidade")).toHaveValue(/5,00/);

  // A leitura de arquivo fica de fora: a nota já existe.
  await expect(
    page.getByRole("heading", { name: "Tem o arquivo da nota?" }),
  ).toHaveCount(0);
});

test("2. corrigir acerta estoque, custo e o gasto do Financeiro", async ({
  page,
}) => {
  await page.goto(`/estoque/compras/${notaId}/editar`);

  await page.locator("#supplier").fill(FORNECEDOR_CERTO);
  const linha = page.locator(`${sel.itens} li`).first();
  // Chegaram 12 (não 10) e o custo real era R$ 5,50 → R$ 66,00.
  await linha.getByLabel("Quantidade").fill("12");
  await linha.getByLabel("Custo por unidade").fill("550");
  await expect(page.getByText("R$ 66,00").first()).toBeVisible();

  await page
    .getByRole("button", { name: "Conferir e salvar correção" })
    .click();
  const dialogo = page.getByRole("dialog");
  // O resumo compara o que era com o que passa a ser.
  await expect(dialogo).toContainText("R$ 50,00");
  await expect(dialogo).toContainText("R$ 66,00");
  await dialogo
    .getByRole("button", { name: "Salvar correção", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp(`/estoque/compras/${notaId}`));
  await expect(page.getByText("Correção salva")).toBeVisible();
  await expect(page.getByText("Corrigida em")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: FORNECEDOR_CERTO }),
  ).toBeVisible();

  // ── Conferência NO BANCO (docs/09 §1) ─────────────────────────────
  const { data: notaData } = await app
    .from("purchases")
    .select("supplier_name, total, edited_at, source, expense_id")
    .eq("id", notaId)
    .single();
  const nota = notaData as {
    supplier_name: string;
    total: number;
    edited_at: string | null;
    source: string;
    expense_id: string | null;
  };
  expect(nota.supplier_name).toBe(FORNECEDOR_CERTO);
  expect(Number(nota.total)).toBe(66);
  expect(nota.edited_at).not.toBeNull();
  expect(nota.source).toBe("manual");

  // Estoque andou de 10 para 12 (a diferença), e o custo acompanhou.
  const { data: produtoData } = await app
    .from("products")
    .select("stock_quantity, cost_price")
    .eq("id", produtoId)
    .single();
  const produto = produtoData as {
    stock_quantity: number;
    cost_price: number;
  };
  expect(Number(produto.stock_quantity)).toBe(12);
  expect(Number(produto.cost_price)).toBe(5.5);

  // O acerto virou movimento de entrada, com o texto da correção.
  const { data: movsData } = await app
    .from("stock_movements")
    .select("type, quantity, note")
    .eq("product_id", produtoId)
    .order("created_at", { ascending: false })
    .limit(1);
  const mov = (movsData ?? []) as {
    type: string;
    quantity: number;
    note: string | null;
  }[];
  expect(mov[0]?.type).toBe("purchase");
  expect(Number(mov[0]?.quantity)).toBe(2);
  expect(mov[0]?.note).toContain("Correção de nota");

  // O gasto é o MESMO lançamento, com o valor corrigido.
  const { data: gastoData } = await app
    .from("expenses")
    .select("amount, description")
    .eq("id", nota.expense_id!)
    .single();
  const gasto = gastoData as { amount: number; description: string };
  expect(Number(gasto.amount)).toBe(66);
  expect(gasto.description).toContain(FORNECEDOR_CERTO);

  // E é isso que o Financeiro mostra.
  await page.goto("/financeiro?tab=despesas");
  await expect(page.getByText(FORNECEDOR_CERTO).first()).toBeVisible();
});

test("3. dá para incluir um produto novo na correção", async ({ page }) => {
  await page.goto(`/estoque/compras/${notaId}/editar`);

  await page.locator("#nota-query").fill("Zcorrige e2e Molho");
  await page.locator("#nota-query").press("Enter");
  const bloco = page.locator('section[aria-labelledby="nota-adicionar"]');
  await bloco.getByLabel("Quantidade que chegou").fill("3");
  await bloco.getByLabel("Custo por unidade").fill("700");
  await bloco.getByLabel("Preço de venda").fill("1500");
  await bloco.getByRole("button", { name: "Adicionar à nota" }).click();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(2);

  await page
    .getByRole("button", { name: "Conferir e salvar correção" })
    .click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("1 produto novo será criado");
  await dialogo
    .getByRole("button", { name: "Salvar correção", exact: true })
    .click();
  await expect(page.getByText("Correção salva")).toBeVisible();

  const { data: novoData } = await app
    .from("products")
    .select("stock_quantity, cost_price, price")
    .eq("name", "Zcorrige e2e Molho")
    .single();
  const novo = novoData as {
    stock_quantity: number;
    cost_price: number;
    price: number;
  };
  expect(Number(novo.stock_quantity)).toBe(3);
  expect(Number(novo.cost_price)).toBe(7);
  expect(Number(novo.price)).toBe(15);

  // O total da nota (66 + 21) foi para o gasto junto.
  const { data: notaData } = await app
    .from("purchases")
    .select("total, expense_id")
    .eq("id", notaId)
    .single();
  const nota = notaData as { total: number; expense_id: string };
  expect(Number(nota.total)).toBe(87);
  const { data: gastoData } = await app
    .from("expenses")
    .select("amount")
    .eq("id", nota.expense_id)
    .single();
  expect(Number((gastoData as { amount: number }).amount)).toBe(87);
});

test("4. nota cancelada não se corrige", async ({ page }) => {
  await page.goto(`/estoque/compras/${notaCanceladaId}`);
  await expect(page.getByText("Esta nota foi cancelada em")).toBeVisible();
  await expect(page.getByRole("link", { name: "Corrigir nota" })).toHaveCount(
    0,
  );

  // E o endereço direto devolve para a nota, em vez de abrir o formulário.
  await page.goto(`/estoque/compras/${notaCanceladaId}/editar`);
  await expect(page).toHaveURL(
    new RegExp(`/estoque/compras/${notaCanceladaId}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Corrigir nota" }),
  ).toHaveCount(0);
});
