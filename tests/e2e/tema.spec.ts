import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, loginPelaUI, userClient, type TestUser } from "./helpers";

/**
 * O tema é escolha da CONTA, não do aparelho.
 *
 * O bug que este arquivo tranca: o tema aplicado vinha só do cookie
 * `erp_theme`, que é por navegador. Em aparelho novo (ou com o cookie
 * limpo) a tela voltava para o claro enquanto a chave em Preferências —
 * que lê o banco — continuava marcada em "Escuro".
 *
 * O tema é gravado direto no perfil (é o mesmo que a tela de Preferências
 * faz) para o teste medir só o que interessa: o que chega ao `<html>`.
 */

test.describe.configure({ mode: "serial" });

const THEME_COOKIE = "erp_theme";

let user: TestUser;
let app: SupabaseClient;

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);
  const { error } = await app
    .from("profiles")
    .update({ theme: "dark" })
    .eq("id", user.id);
  expect(error).toBeNull();
});

test.afterAll(async () => {
  // Devolve a conta ao padrão: o restante do suíte (inclusive os visuais)
  // parte do tema claro.
  await app.from("profiles").update({ theme: "light" }).eq("id", user.id);
});

test.describe("aparelho que já tem sessão", () => {
  test.use({ storageState: STATE_FUNCIONAL });

  test("tema escuro se aplica sem o cookie e o cookie volta a existir", async ({
    page,
    context,
  }) => {
    // Aparelho novo: mesma conta, nenhum cookie de tema.
    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(cookies.filter((c) => c.name !== THEME_COOKIE));

    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // O cookie é só cache do script anti-flash: recriado na primeira visita,
    // para as próximas não custarem uma consulta ao banco.
    await expect
      .poll(
        async () =>
          (await context.cookies()).find((c) => c.name === THEME_COOKIE)?.value,
      )
      .toBe("dark");
  });

  test("a tela de Preferências mostra a chave coerente com o que se vê", async ({
    page,
  }) => {
    await page.goto("/preferencias");
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("aparelho que nunca entrou", () => {
  // Sem sessão nenhuma: a tela de login é sempre clara, e o tema da conta
  // precisa valer já na chegada ao painel — que acontece por navegação de
  // cliente, sem recarregar o documento.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("entrar pela tela de login traz o tema da conta", async ({ page }) => {
    await loginPelaUI(page, user);
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
