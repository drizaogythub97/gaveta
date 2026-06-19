import { expect, test } from "@playwright/test";

test("pagina inicial carrega com titulo do sistema", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ERP Simples" }),
  ).toBeVisible();
});
