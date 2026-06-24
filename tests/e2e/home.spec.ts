import { expect, test } from "@playwright/test";

test("a raiz redireciona para o login com a marca Gaveta visível", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Gaveta")).toBeVisible();
});
