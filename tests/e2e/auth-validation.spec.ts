import { expect, test } from "@playwright/test";

// A validação (Zod) roda no servidor ANTES do rate limit e antes de qualquer
// chamada ao Supabase. Logo, entradas inválidas exercitam o caminho de erro
// sem criar usuários reais nem consumir o limite de tentativas.

test.describe("Validação do formulário de login", () => {
  test("e-mail inválido mostra mensagem de erro acessível", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("E-mail").fill("não-é-email");
    await page.getByLabel("Senha", { exact: true }).fill("alguma-coisa");
    await page.getByRole("button", { name: "Entrar" }).click();

    const erro = page.getByRole("alert").filter({
      hasText: "Digite um e-mail válido.",
    });
    await expect(erro).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("senha vazia mostra mensagem de erro", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("E-mail").fill("pessoa@exemplo.com");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Informe a senha." }),
    ).toBeVisible();
  });
});

test.describe("Validação do formulário de criar conta", () => {
  test("aceitar a política é obrigatório e a senha fraca é rejeitada", async ({
    page,
  }) => {
    await page.goto("/signup");

    await page.getByLabel("Nome completo").fill("Maria Silva");
    await page.getByLabel("E-mail").fill("maria@exemplo.com");
    await page.getByLabel(/Senha/).fill("123");
    // Sem marcar a Política de Privacidade.
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Política de Privacidade",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "ao menos 8 caracteres" }),
    ).toBeVisible();
  });
});
