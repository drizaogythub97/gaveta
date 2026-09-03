import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient } from "./helpers";

/**
 * Feedback visual de carregamento — os quatro níveis.
 *
 * O que estes testes guardam não é a aparência, e sim a REGRA que separa os
 * níveis, que é onde é fácil errar depois:
 *
 * 1. entrar no sistema mostra o loader de marca em tela cheia, porque ali a
 *    pessoa ainda não sabe se o toque funcionou;
 * 2. filtrar NÃO troca a tela pelo loader — a tela continua onde estava.
 *    Este é o erro que a proposta existia para evitar, e é o único que
 *    ninguém percebe lendo o código.
 */

test.describe("nível 1 — entrar no sistema", () => {
  // Sem sessão: este bloco precisa passar pela tela de login de verdade.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("mostra o loader de marca entre o Entrar e o painel", async ({
    page,
  }) => {
    const user = loadUsers().funcional;

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);

    // O loader tem role=status e anuncia "Entrando…" — é por aí que se
    // confere, e não por pixel: a animação é sorteada entre três.
    const entrando = page.getByRole("status").filter({ hasText: "Entrando" });
    await page.getByRole("button", { name: "Entrar" }).click();

    // Antes, aqui não havia nada: o botão voltava ao normal e a tela de
    // login ficava parada até o painel montar.
    await expect(entrando).toBeVisible({ timeout: 10_000 });

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("nível 2 — filtrar não troca a tela", () => {
  test.use({ storageState: STATE_FUNCIONAL });

  const NOME = "Zcarregamento produto e2e";
  let app: SupabaseClient;
  let produtoId = "";

  test.beforeAll(async () => {
    const user = loadUsers().funcional;
    app = userClient(user.accessToken);
    // Um produto próprio, para o teste não depender do que outros arquivos
    // deixaram no catálogo (a ordem alfabética entre specs muda o cenário).
    const { data, error } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name: NOME,
        price: 9.9,
        track_stock: false,
        stock_quantity: null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    produtoId = (data as { id: string }).id;
  });

  test.afterAll(async () => {
    if (produtoId) await app.from("products").delete().eq("id", produtoId);
  });

  test("a tela continua no lugar durante a busca", async ({ page }) => {
    await page.goto("/produtos");
    await expect(
      page.getByRole("heading", { name: "Produtos", level: 1 }),
    ).toBeVisible();

    // Marca o cabeçalho, que fica FORA da região dos resultados. Se o
    // carregador de tela cheia entrasse, ele substituiria a página inteira e
    // a marca se perderia.
    await page.evaluate(() => {
      document.querySelector("h1")?.setAttribute("data-marcado", "1");
    });

    await page.getByLabel("Buscar por nome").fill(NOME);
    await expect(page.getByRole("link", { name: `Editar ${NOME}` })).toHaveCount(
      1,
    );

    // O loader de marca NÃO pode ter aparecido...
    await expect(
      page.getByRole("status").filter({ hasText: "Carregando" }),
    ).toHaveCount(0);
    // ...e a página é a mesma de antes, não uma remontada.
    await expect(page.locator("h1[data-marcado='1']")).toHaveCount(1);
  });

  test("a busca some da URL ao limpar, e a lista volta", async ({ page }) => {
    await page.goto(`/produtos?q=${encodeURIComponent(NOME)}`);
    await expect(page.getByRole("link", { name: `Editar ${NOME}` })).toHaveCount(
      1,
    );

    await page.getByRole("button", { name: "Limpar a busca" }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
  });
});
