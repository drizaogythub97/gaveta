import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_VISUAL } from "../../playwright.config";

import { esperaContrasteAA } from "./a11y";
import { loadUsers, userClient } from "./helpers";

/**
 * Verificação visual da tela de Produtos (protocolo docs/09 §2).
 *
 * A tela concentra quase toda a interface nova desta sprint — busca por
 * nome, categorias em lista suspensa e a confirmação que chega junto com a
 * tela — e não tinha nenhuma cobertura visual. Roda nos dois projetos,
 * `desktop` e `mobile`, e no celular também no modo Minimalista.
 *
 * O usuário "visual" tem estado SEMEADO e fixo (auth.setup.ts): café e bolo.
 * As categorias abaixo são criadas aqui e apagadas no fim, para a foto não
 * depender do que outro arquivo deixou.
 */

test.use({ storageState: STATE_VISUAL });
test.describe.configure({ mode: "serial" });

const CATEGORIA_1 = "Bebidas";
const CATEGORIA_2 = "Padaria";

let app: SupabaseClient;
let idsTags: string[] = [];

test.beforeAll(async () => {
  const user = loadUsers().visual;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("product_tags")
    .insert([
      { user_id: user.id, name: CATEGORIA_1 },
      { user_id: user.id, name: CATEGORIA_2 },
    ])
    .select("id, name");
  expect(error).toBeNull();
  const tags = (data ?? []) as { id: string; name: string }[];
  idsTags = tags.map((t) => t.id);

  // Uma categoria vinculada, para a foto pegar também o chip no produto.
  const { data: cafe } = await app
    .from("products")
    .select("id")
    .eq("name", "Café torrado 500g")
    .single();
  await app.from("product_tag_links").insert({
    user_id: user.id,
    product_id: (cafe as { id: string }).id,
    tag_id: tags.find((t) => t.name === CATEGORIA_1)!.id,
  });
});

test.afterAll(async () => {
  if (idsTags.length > 0) {
    await app.from("product_tags").delete().in("id", idsTags);
  }
});

function ehMobile(): boolean {
  return test.info().project.name === "mobile";
}

async function usarModo(page: Page, modo: "simples" | "minimalista") {
  await page.goto("/produtos");
  await page.evaluate((valor) => {
    document.cookie = `gaveta_ui_mode=${valor}; path=/; max-age=31536000; samesite=lax`;
  }, modo);
}

async function escondeOverlayDoNext(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, #__next-build-watcher { display: none !important; }",
  });
}

async function semRolagemHorizontal(page: Page) {
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(estouro).toBeLessThanOrEqual(1);
}

/** Acessibilidade (docs/02): alvos de toque com pelo menos 44px de altura. */
async function alvosGrandes(page: Page) {
  const pequenos = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return [];
    const alvos = Array.from(
      main.querySelectorAll<HTMLElement>("button, input, select, a[href]"),
    );
    return alvos
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.className.includes("sr-only")) return false;
        const ehLinkDeTexto =
          el.tagName === "A" && !el.className.includes("h-1");
        return !ehLinkDeTexto && r.height < 44;
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
  });
  expect(pequenos).toEqual([]);
}

test("listagem com os filtros novos: layout, alvos e regressão visual", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto("/produtos");
  await expect(
    page.getByRole("heading", { name: "Produtos", level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Buscar por nome")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Filtrar por categoria:/ }),
  ).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("produtos.png", { fullPage: true });
});

test("lista suspensa de categorias aberta: layout e regressão visual", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto("/produtos");
  await page.getByRole("button", { name: /^Filtrar por categoria:/ }).click();

  // Marcada uma, para a foto pegar os dois estados da opção ao mesmo tempo.
  await page.getByRole("checkbox", { name: CATEGORIA_1 }).click();
  await expect(
    page.getByRole("checkbox", { name: CATEGORIA_1, checked: true }),
  ).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("produtos-filtro-aberto.png", {
    fullPage: true,
  });
});

test("confirmação de produto salvo: layout e regressão visual", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  // O mesmo endereço para o qual o formulário manda depois de salvar.
  await page.goto("/produtos?salvo=novo&nome=Bolo%20caseiro");
  await expect(
    page.getByRole("status").filter({ hasText: "cadastrado" }),
  ).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("produtos-salvo.png", {
    fullPage: true,
  });
});

test("celular no modo Minimalista mantém o padrão em Produtos", async ({
  page,
}) => {
  test.skip(!ehMobile(), "O modo Minimalista só muda a escala no celular.");

  await usarModo(page, "minimalista");
  await page.goto("/produtos");
  await expect(
    page.getByRole("heading", { name: "Produtos", level: 1 }),
  ).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("produtos-minimalista.png", {
    fullPage: true,
  });
});
