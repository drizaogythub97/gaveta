import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Produto que ainda não existe, na frente de caixa.
 *
 * Antes só havia o item avulso: nome, valor e quantidade, gravados na venda
 * sem produto por trás — sem custo, sem baixa de estoque e sem conserto
 * possível (o Fechamento fica avisando para sempre). Agora a tela oferece as
 * duas saídas, com o cadastro completo na frente.
 *
 * O que se prova aqui: o produto nasce com custo, estoque e categoria; a
 * venda sai vinculada a ele (com o retrato do custo); e o avulso continua
 * existindo para quem está com o cliente esperando.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const NOVO = "Zcaixa e2e Refrigerante";
const CATEGORIA = "Zcaixa e2e Bebidas";
const AVULSO = "Zcaixa e2e Item avulso";

let user: TestUser;
let app: SupabaseClient;

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);
});

test.afterAll(async () => {
  // Outros arquivos contam o catálogo E as vendas do usuário descartável:
  // o que este criou sai daqui. As duas vendas em dinheiro, se ficassem,
  // entrariam na conta de quem roda depois (a `compras.spec.ts` procurava a
  // venda à vista dela e achava as minhas).
  const { data: linhas } = await app
    .from("sale_items")
    .select("sale_id")
    .in("name_snapshot", [NOVO, AVULSO]);
  const vendas = [
    ...new Set(((linhas ?? []) as { sale_id: string }[]).map((l) => l.sale_id)),
  ];
  if (vendas.length > 0) {
    await app.from("sale_items").delete().in("sale_id", vendas);
    await app.from("sales").delete().in("id", vendas);
  }
  await app.from("products").delete().eq("name", NOVO);
  await app.from("product_tags").delete().eq("name", CATEGORIA);
});

test("1. termo desconhecido oferece cadastrar e vender, com o avulso ao lado", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(NOVO);
  await page.locator("#pos-query").press("Enter");

  await expect(page.getByText(`Nenhum produto encontrado para`)).toBeVisible();

  // As duas saídas aparecem, e o cadastro é a que já vem escolhida.
  const cadastrar = page.getByRole("button", { name: "Cadastrar e vender" });
  const avulso = page.getByRole("button", { name: "Só vender agora" });
  await expect(cadastrar).toHaveAttribute("aria-pressed", "true");
  await expect(avulso).toHaveAttribute("aria-pressed", "false");

  // E a tela diz o que cada caminho custa.
  await expect(page.getByText("entra no estoque, tem custo")).toBeVisible();
  await avulso.click();
  await expect(
    page.getByText("não baixa estoque e fica sem custo"),
  ).toBeVisible();
});

test("2. cadastrar e vender: produto nasce completo e a venda sai vinculada", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(NOVO);
  await page.locator("#pos-query").press("Enter");

  const bloco = page.getByRole("group", { name: "O que fazer com este item" });
  await expect(bloco).toBeVisible();

  await page.getByLabel("Nome do produto").fill(NOVO);
  await page.getByLabel("Preço de venda").fill("800");
  await page.getByLabel("Quanto custou para você (opcional)").fill("500");
  await page.getByLabel("Quantidade", { exact: true }).fill("2");
  await page.getByLabel("Quantas você tem agora").fill("10");

  // Categoria criada na hora, como na entrada por nota: o campo cria e o
  // Enter adiciona sem enviar nada além disso.
  await page.getByLabel("Criar categoria").fill(CATEGORIA);
  await page.getByLabel("Criar categoria").press("Enter");
  await expect(page.getByText(CATEGORIA)).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar e adicionar" }).click();

  // Entrou na venda já como produto (não como avulso).
  await expect(
    page.getByText("foi cadastrado e entrou na venda"),
  ).toBeVisible();
  const carrinho = page.getByRole("listitem").filter({ hasText: NOVO });
  await expect(carrinho).toBeVisible();
  await expect(carrinho).not.toContainText("(avulso)");

  // ── Conferência NO BANCO: o produto nasceu completo ────────────────
  const { data: produtoData } = await app
    .from("products")
    .select("id, price, cost_price, track_stock, stock_quantity")
    .eq("name", NOVO)
    .single();
  const produto = produtoData as {
    id: string;
    price: number;
    cost_price: number;
    track_stock: boolean;
    stock_quantity: number;
  };
  expect(Number(produto.price)).toBe(8);
  expect(Number(produto.cost_price)).toBe(5);
  expect(produto.track_stock).toBe(true);
  expect(Number(produto.stock_quantity)).toBe(10);

  const { data: vinculos } = await app
    .from("product_tag_links")
    .select("tag_id, product_tags(name)")
    .eq("product_id", produto.id);
  const nomes = (
    (vinculos ?? []) as unknown as {
      product_tags: { name: string } | null;
    }[]
  ).map((v) => v.product_tags?.name);
  expect(nomes).toContain(CATEGORIA);

  // ── Fecha a venda e confere o vínculo e o custo ────────────────────
  await page.locator("#paid-amount").fill("10000");
  await page.getByRole("button", { name: "Registrar venda" }).click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/Venda registrada/i)).toBeVisible();

  const { data: itens } = await app
    .from("sale_items")
    .select("product_id, quantity, unit_cost, line_total")
    .eq("product_id", produto.id);
  const item = (
    (itens ?? []) as {
      product_id: string | null;
      quantity: number;
      unit_cost: number | null;
      line_total: number;
    }[]
  )[0];
  expect(item.product_id).toBe(produto.id);
  expect(Number(item.quantity)).toBe(2);
  // O retrato do custo saiu preenchido: esta venda NÃO entra no aviso do
  // Fechamento, que era o buraco do item avulso.
  expect(Number(item.unit_cost)).toBe(5);
  expect(Number(item.line_total)).toBe(16);

  // Estoque baixou as 2 unidades vendidas das 10 informadas.
  const { data: depoisData } = await app
    .from("products")
    .select("stock_quantity")
    .eq("id", produto.id)
    .single();
  expect(
    Number((depoisData as { stock_quantity: number }).stock_quantity),
  ).toBe(8);
});

test("3. o avulso continua existindo para quem está com pressa", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(AVULSO);
  await page.locator("#pos-query").press("Enter");

  await page.getByRole("button", { name: "Só vender agora" }).click();
  await page.getByLabel("Nome do item").fill(AVULSO);
  await page.getByLabel("Valor", { exact: true }).fill("350");
  await page.getByRole("button", { name: "Adicionar avulso" }).click();

  const linha = page.getByRole("listitem").filter({ hasText: AVULSO });
  await expect(linha).toContainText("(avulso)");

  await page.locator("#paid-amount").fill("10000");
  await page.getByRole("button", { name: "Registrar venda" }).click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/Venda registrada/i)).toBeVisible();

  const { data: itens } = await app
    .from("sale_items")
    .select("product_id, unit_cost")
    .eq("name_snapshot", AVULSO);
  const item = (
    (itens ?? []) as {
      product_id: string | null;
      unit_cost: number | null;
    }[]
  )[0];
  expect(item.product_id).toBeNull();
  // E segue sem custo: é a limitação que a tela avisa antes de a pessoa
  // escolher esse caminho.
  expect(item.unit_cost).toBeNull();
});
