import { test, type Page } from "@playwright/test";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient } from "./helpers";

/**
 * TEMPORÁRIO — medição das navegações que o dono apontou como "sem feedback".
 * Não faz parte da suíte; apagar depois de ler os números.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const user = loadUsers().funcional;
  const app = userClient(user.accessToken);
  await app.from("products").insert([
    { user_id: user.id, name: "Zmedicao cafe", price: 10, track_stock: true, stock_quantity: 5 },
    { user_id: user.id, name: "Zmedicao bolo", price: 20, track_stock: true, stock_quantity: 3 },
  ]);
});

/** Instala um vigia que registra se o loader de marca chegou a aparecer. */
async function vigiarLoader(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __loader?: boolean; __obs?: MutationObserver };
    w.__loader = false;
    const olhar = () => {
      for (const el of Array.from(document.querySelectorAll('[role="status"]'))) {
        if ((el.textContent ?? "").includes("Carregando")) w.__loader = true;
      }
    };
    olhar();
    w.__obs = new MutationObserver(olhar);
    w.__obs.observe(document.body, { childList: true, subtree: true });
  });
}

async function viuLoader(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __loader?: boolean }).__loader === true,
  );
}

async function medir(
  page: Page,
  nome: string,
  clicar: () => Promise<void>,
  esperar: () => Promise<void>,
) {
  await vigiarLoader(page);
  const t0 = Date.now();
  await clicar();
  await esperar();
  const ms = Date.now() - t0;
  const loader = await viuLoader(page);
  console.log(
    `MEDIDA | ${nome.padEnd(46)} | ${String(ms).padStart(5)} ms | loader: ${loader ? "SIM" : "não"}`,
  );
}

test("mede as navegações apontadas pelo dono", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/produtos");
  await page.getByRole("heading", { name: "Produtos", level: 1 }).waitFor();

  await medir(
    page,
    "Produtos → Novo produto",
    () => page.getByRole("link", { name: "Novo produto" }).click(),
    () =>
      page.getByRole("heading", { name: /Novo produto/ }).first().waitFor(),
  );

  await page.goto("/produtos");
  await page.getByRole("heading", { name: "Produtos", level: 1 }).waitFor();
  await medir(
    page,
    "Produtos → Editar (card)",
    () => page.getByRole("link", { name: /^Editar / }).first().click(),
    () =>
      page.getByRole("heading", { name: /Editar produto/ }).first().waitFor(),
  );

  await page.goto("/estoque");
  await page.getByRole("heading", { name: "Estoque", level: 1 }).waitFor();
  await medir(
    page,
    "Estoque → Entrada por nota",
    () => page.getByRole("link", { name: "Entrada por nota" }).click(),
    () => page.locator("#nota-query").waitFor(),
  );

  await medir(
    page,
    "Entrada por nota → Voltar para Estoque",
    () => page.getByRole("link", { name: /Voltar para/ }).first().click(),
    () => page.getByRole("heading", { name: "Estoque", level: 1 }).waitFor(),
  );

  await medir(
    page,
    "Estoque → Ver movimentação",
    () => page.getByRole("link", { name: "Ver movimentação" }).click(),
    () =>
      page.getByRole("heading", { name: /Movimenta/ }).first().waitFor(),
  );

  await medir(
    page,
    "Movimentação → Voltar para Estoque",
    () => page.getByRole("link", { name: /Voltar para/ }).first().click(),
    () => page.getByRole("heading", { name: "Estoque", level: 1 }).waitFor(),
  );

  // Filtro do Estoque: é client-side (useMemo), não há ida ao servidor.
  await vigiarLoader(page);
  const t0 = Date.now();
  await page.getByLabel("Nome ou código").fill("café");
  await page.waitForTimeout(50);
  console.log(
    `MEDIDA | ${"Estoque → filtro por nome (cliente)".padEnd(46)} | ${String(
      Date.now() - t0,
    ).padStart(5)} ms | loader: ${(await viuLoader(page)) ? "SIM" : "não"}`,
  );

  // Comparação: o filtro de Produtos, que VAI ao servidor.
  await page.goto("/produtos");
  await page.getByRole("heading", { name: "Produtos", level: 1 }).waitFor();
  await vigiarLoader(page);
  const t1 = Date.now();
  await page.getByLabel("Buscar por nome").fill("Zproduto");
  await page.waitForFunction(
    () => document.querySelector('[aria-busy="true"]') !== null,
    undefined,
    { timeout: 5000 },
  ).catch(() => console.log("  (não flagrou aria-busy=true no caminho)"));
  console.log(
    `MEDIDA | ${"Produtos → busca (servidor)".padEnd(46)} | ${String(
      Date.now() - t1,
    ).padStart(5)} ms até aria-busy`,
  );
});
