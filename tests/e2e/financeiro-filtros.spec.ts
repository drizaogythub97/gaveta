import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * O comportamento dos filtros do Financeiro.
 *
 * O bug que este arquivo tranca: o intervalo "Personalizado" era um
 * `<form method="get">`. O navegador montava uma query NOVA só com os
 * campos do formulário — a aba aberta sumia da URL — e recarregava o
 * documento inteiro. Quem estava no Fechamento voltava para Vendas e tinha
 * de clicar de novo na aba.
 *
 * Aqui se prova as duas metades: a aba permanece E a página não recarrega.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PRODUTO = "Cafe Filtros e2e";

let user: TestUser;
let app: SupabaseClient;

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: PRODUTO,
      price: 30,
      cost_price: 12,
      track_stock: true,
      stock_quantity: 50,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  // Uma venda de hoje, para o dia a dia ter o que mostrar.
  const { error: erroVenda } = await app.rpc("register_sale", {
    items: [
      {
        product_id: (data as { id: string }).id,
        name: PRODUTO,
        unit_price: 30,
        quantity: 2,
      },
    ],
    payment_method: "dinheiro",
  });
  expect(erroVenda).toBeNull();
});

/**
 * Marca o documento. Se a página recarregar, a marca se perde — é a prova
 * direta de que o filtro foi aplicado por navegação de cliente.
 */
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

function hoje(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("intervalo personalizado filtra NA aba aberta, sem recarregar", async ({
  page,
}) => {
  await page.goto("/financeiro?tab=fechamento");
  await expect(
    page.getByRole("heading", { name: "Dia a dia" }),
  ).toBeVisible();

  await marcarDocumento(page);

  await page.getByRole("radio", { name: "Personalizado" }).click();
  await page.locator("#from").fill(hoje());
  await page.locator("#to").fill(hoje());
  await page.getByRole("button", { name: "Aplicar" }).click();

  // 1. A aba continua sendo a Fechamento — na URL e na tela.
  await expect(page).toHaveURL(/tab=fechamento/);
  await expect(page).toHaveURL(/period=custom/);
  await expect(page.getByRole("heading", { name: "Dia a dia" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fechamento" }),
  ).toHaveAttribute("aria-current", "page");

  // 2. E nada disso passou por um recarregamento de página.
  expect(await documentoIntacto(page)).toBe(true);
});

test("trocar de aba preserva o intervalo escolhido", async ({ page }) => {
  await page.goto(`/financeiro?tab=fechamento&period=custom&from=${hoje()}&to=${hoje()}`);
  await marcarDocumento(page);

  await page.getByRole("link", { name: "Vendas" }).click();

  await expect(page).toHaveURL(/tab=vendas/);
  await expect(page).toHaveURL(/period=custom/);
  await expect(page).toHaveURL(new RegExp(`from=${hoje()}`));
  expect(await documentoIntacto(page)).toBe(true);
});

test("o dia a dia abre nas vendas daquele dia, com custo e lucro", async ({
  page,
}) => {
  await page.goto("/financeiro?tab=fechamento&period=today");

  const dia = page
    .getByRole("button", { name: new RegExp(hoje().split("-").reverse().join("/")) })
    .first();
  await expect(dia).toBeVisible();
  await expect(dia).toHaveAttribute("aria-expanded", "false");

  await marcarDocumento(page);
  await dia.click();
  await expect(dia).toHaveAttribute("aria-expanded", "true");

  // O produto vendido aparece com o custo e o lucro daquela linha.
  const detalhe = page.getByText(PRODUTO).first();
  await expect(detalhe).toBeVisible();
  // \s e não " ": o Intl pt-BR separa "R$" do número com espaço NÃO
  // separável (U+00A0), que não casa com um espaço comum.
  await expect(page.getByText(/custo R\$\s24,00/).first()).toBeVisible();
  await expect(page.getByText(/lucro R\$\s36,00/).first()).toBeVisible();

  // Abrir o dia também não recarrega nada: é uma Server Action.
  expect(await documentoIntacto(page)).toBe(true);
});
