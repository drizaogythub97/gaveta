import { expect, test } from "@playwright/test";

test.describe("Navegação entre as telas de autenticação", () => {
  test("do login é possível chegar a criar conta e voltar", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(
      page.getByText("É grátis e leva menos de um minuto."),
    ).toBeVisible();

    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText("Acesse sua conta com e-mail e senha."),
    ).toBeVisible();
  });

  test("do login é possível chegar à recuperação de senha", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/recover/);
    await expect(
      page.getByText(
        "Informe seu e-mail e enviaremos um link para criar uma nova senha.",
      ),
    ).toBeVisible();

    await page.getByRole("link", { name: "Voltar para entrar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText("Acesse sua conta com e-mail e senha."),
    ).toBeVisible();
  });

  test("o link da Política de Privacidade abre a página pública", async ({
    page,
  }) => {
    await page.goto("/privacidade");
    await expect(page).toHaveURL(/\/privacidade/);
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
  });
});
