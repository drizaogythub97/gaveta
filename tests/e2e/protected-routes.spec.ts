import { expect, test } from "@playwright/test";

// O middleware redireciona visitantes não autenticados para /login,
// preservando o destino em ?next=. Garante que a área autenticada não
// fica exposta.

const protectedRoutes = [
  "/dashboard",
  "/caixa",
  "/estoque",
  "/financeiro",
  "/produtos",
  "/minha-conta",
  "/configuracoes",
];

for (const route of protectedRoutes) {
  test(`${route} sem login redireciona para /login preservando o destino`, async ({
    page,
  }) => {
    await page.goto(route);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(route)}`),
    );
    await expect(
      page.getByText("Acesse sua conta com e-mail e senha."),
    ).toBeVisible();
  });
}
