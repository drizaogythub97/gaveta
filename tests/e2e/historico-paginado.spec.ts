import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * A razão do estoque não esconde histórico.
 *
 * Antes ela mostrava os 100 movimentos mais recentes e parava — sem
 * paginação e sem dizer que havia mais. Como CADA item vendido gera um
 * movimento, o corte chegava em poucos dias de uso: medido em produção em
 * 10/09, já eram 97 de 100. Ver o achado B de `docs/10-ACHADOS-DE-LOGICA.md`.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PRODUTO = "Zpaginacao e2e Produto";
const QUANTOS = 18; // mais de uma página de 15

let user: TestUser;
let app: SupabaseClient;
let produtoId = "";

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: PRODUTO,
      price: 10,
      track_stock: true,
      stock_quantity: 100,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  produtoId = (data as { id: string }).id;

  // Os movimentos nascem com created_at afastado um minuto entre si: sem
  // isso, a ordenação entre eles não é garantida e o teste não poderia
  // afirmar QUAL deles ficou na última página.
  const base = Date.now() - QUANTOS * 60_000;
  const { error: erroMov } = await app.from("stock_movements").insert(
    Array.from({ length: QUANTOS }, (_, i) => ({
      user_id: user.id,
      product_id: produtoId,
      type: "adjust" as const,
      quantity: i + 1,
      note: `Zpaginacao ${String(i + 1).padStart(2, "0")}`,
      created_at: new Date(base + i * 60_000).toISOString(),
    })),
  );
  expect(erroMov).toBeNull();
});

test.afterAll(async () => {
  await app.from("stock_movements").delete().eq("product_id", produtoId);
  await app.from("products").delete().eq("id", produtoId);
});

test("a movimentação pagina e diz quantas existem", async ({ page }) => {
  await page.goto("/estoque/movimentacoes");

  const navegacao = page.getByRole("navigation", {
    name: "Páginas da movimentação de estoque",
  });
  await expect(navegacao).toBeVisible();
  await expect(navegacao).toContainText("Página 1 de");
  await expect(navegacao).toContainText("movimentações");

  // 15 por página, e não a lista inteira nem as 100 de antes. O recorte é
  // `main`: a navegação do topo também é uma lista.
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(15);
});

test("o movimento mais antigo continua alcançável — era o que sumia", async ({
  page,
}) => {
  await page.goto("/estoque/movimentacoes");

  const navegacao = page.getByRole("navigation", {
    name: "Páginas da movimentação de estoque",
  });
  const texto = (await navegacao.textContent()) ?? "";
  const total = Number(/Página \d+ de (\d+)/.exec(texto)?.[1] ?? "0");
  expect(total).toBeGreaterThan(1);

  // Os movimentos deste arquivo nasceram com data anterior a todos os
  // outros, então o mais antigo de todos é o ÚLTIMO da última página — a
  // linha que, com o corte antigo, deixaria de existir para o usuário.
  await page.goto(`/estoque/movimentacoes?page=${total}`);
  const linhas = page.getByRole("main").getByRole("listitem");
  await expect(linhas.last()).toContainText(PRODUTO);
});

test("filtrar por tipo volta para a primeira página", async ({ page }) => {
  await page.goto("/estoque/movimentacoes?page=2");
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();

  await expect(page).toHaveURL(/type=adjust/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByRole("navigation", {
      name: "Páginas da movimentação de estoque",
    }),
  ).toContainText("Página 1 de");
});
