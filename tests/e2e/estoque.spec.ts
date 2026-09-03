import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Filtros do Estoque — agora no banco, como os de Produtos.
 *
 * Antes esta tela carregava o catálogo inteiro e filtrava no navegador:
 * instantâneo, mas sem paginação, sem endereço compartilhável e pesado no
 * celular. O que se guarda aqui é o contrato novo: **o recorte vive na URL**,
 * o corte é feito no banco (15 por página, contagem exata) e filtrar NÃO
 * recarrega o documento.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PREFIXO = "Zestoque e2e";
const QUANTOS = 17; // mais de uma página
const CODIGO = "7899911122233";

let user: TestUser;
let app: SupabaseClient;
let idsCriados: string[] = [];

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  // A quantidade acompanha o número do nome: o item 03 tem 3 em estoque.
  // É isso que deixa os filtros de faixa e de estoque baixo previsíveis.
  const { data, error } = await app
    .from("products")
    .insert(
      Array.from({ length: QUANTOS }, (_, i) => ({
        user_id: user.id,
        name: `${PREFIXO} ${String(i + 1).padStart(2, "0")}`,
        price: 5 + i,
        track_stock: true,
        stock_quantity: i + 1,
      })),
    )
    .select("id, name");
  expect(error).toBeNull();
  const criados = (data ?? []) as { id: string; name: string }[];
  idsCriados = criados.map((p) => p.id);

  // Um código de barras no primeiro item, para provar a busca por bipe.
  const primeiro = criados.find((p) => p.name.endsWith("01"));
  const { error: erroCodigo } = await app
    .from("product_barcodes")
    .insert({ user_id: user.id, product_id: primeiro!.id, barcode: CODIGO });
  expect(erroCodigo).toBeNull();
});

test.afterAll(async () => {
  // Limpa o que este arquivo criou: outros testes contam o catálogo.
  if (idsCriados.length > 0) {
    await app.from("products").delete().in("id", idsCriados);
  }
});

/** Marca o documento: se a página recarregar, a marca se perde. */
async function marcarDocumento(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __semRecarregar?: boolean }).__semRecarregar = true;
  });
}

async function documentoIntacto(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __semRecarregar?: boolean }).__semRecarregar ===
      true,
  );
}

/** Uma linha da lista do estoque é um item com o botão de receber entrada. */
const linhas = (page: Page) =>
  page.getByRole("listitem").filter({ hasText: PREFIXO });

test("mostra 15 itens por página, com paginação", async ({ page }) => {
  await page.goto(`/estoque?q=${encodeURIComponent(PREFIXO)}`);

  await expect(linhas(page)).toHaveCount(15);
  await expect(
    page.getByRole("navigation", { name: "Páginas da lista do estoque" }),
  ).toBeVisible();
});

test("a próxima página troca só a lista, sem recarregar", async ({ page }) => {
  await page.goto(`/estoque?q=${encodeURIComponent(PREFIXO)}`);
  await expect(linhas(page)).toHaveCount(15);

  await marcarDocumento(page);
  await page.getByRole("link", { name: "Próxima →" }).click();

  await expect(page).toHaveURL(/page=2/);
  // Sobram 2 dos 17 na segunda página.
  await expect(linhas(page)).toHaveCount(2);
  expect(await documentoIntacto(page)).toBe(true);
});

test("buscar por nome filtra no banco sem trocar a tela", async ({ page }) => {
  await page.goto("/estoque");
  await expect(
    page.getByRole("heading", { name: "Estoque", level: 1 }),
  ).toBeVisible();

  await marcarDocumento(page);
  await page.getByLabel("Nome ou código").fill(`${PREFIXO} 03`);

  await expect(page).toHaveURL(/[?&]q=/);
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText(`${PREFIXO} 03`);

  // O termo foi para a URL e a lista veio do servidor, mas a tela é a mesma:
  // sem carregador de tela cheia e sem recarregar o documento.
  expect(await documentoIntacto(page)).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Carregando" }),
  ).toHaveCount(0);
});

test("buscar pelo código de barras acha o produto", async ({ page }) => {
  // É o caminho de quem bipa com a câmera: o código lido vira o termo, e a
  // consulta procura no nome OU nos códigos.
  await page.goto(`/estoque?q=${CODIGO}`);

  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText(`${PREFIXO} 01`);
});

test("só estoque baixo corta pela quantidade", async ({ page }) => {
  await page.goto(`/estoque?q=${encodeURIComponent(PREFIXO)}&low=1`);

  // Estoque baixo é ≤ 5: sobram os itens 01 a 05.
  await expect(linhas(page)).toHaveCount(5);
  await expect(page.getByLabel(/Só estoque baixo/)).toBeChecked();
});

test("a faixa de quantidade filtra pelos dois lados", async ({ page }) => {
  await page.goto(`/estoque?q=${encodeURIComponent(PREFIXO)}&min=10&max=12`);

  await expect(linhas(page)).toHaveCount(3);
  await expect(page.getByLabel("Quantidade mínima")).toHaveValue("10");
  await expect(page.getByLabel("Quantidade máxima")).toHaveValue("12");
});

test("limpar filtros tira todos os parâmetros da URL", async ({ page }) => {
  await page.goto(`/estoque?q=${encodeURIComponent(PREFIXO)}&low=1&min=2`);
  await expect(linhas(page)).toHaveCount(4); // 02 a 05

  await marcarDocumento(page);
  await page.getByRole("button", { name: "Limpar filtros" }).click();

  await expect(page).not.toHaveURL(/[?&](q|low|min|max|from|to)=/);
  expect(await documentoIntacto(page)).toBe(true);
});
