import { expect, test } from "@playwright/test";

import { STATE_VISUAL } from "../../playwright.config";

import { esperaContrasteAA } from "./a11y";
import {
  alvosGrandes,
  ehMobile,
  escondeOverlayDoNext,
  semRolagemHorizontal,
  usarModo,
} from "./visual-helpers";

/**
 * Verificação visual da frente de caixa, do Painel e do Estoque.
 *
 * Estas eram as telas SEM nenhuma cobertura visual, e foi por isso que o
 * achado H sobreviveu: em 1280px exatos o conteúdo do caixa começava 26px à
 * esquerda da tela, e o projeto `desktop` roda exatamente a 1280px. A falha
 * estava debaixo da câmera o tempo todo — faltava apontá-la para cá.
 *
 * A foto de referência é só do CAIXA, que é estável: carrinho vazio, sem
 * nada que dependa da data ou do que outra spec deixou no banco. Painel e
 * Estoque ficam com as verificações estruturais (não rolar de lado, alvo de
 * toque e contraste), que é o que pega defeito de layout sem criar imagem
 * que muda todo dia.
 */

test.use({ storageState: STATE_VISUAL });
test.describe.configure({ mode: "serial" });

async function conferirEstrutura(page: import("@playwright/test").Page) {
  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);
}

test("frente de caixa: layout, alvos e regressão visual", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples", "/caixa");

  await page.goto("/caixa");
  await expect(
    page.getByRole("heading", { name: "Frente de caixa", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#pos-query")).toBeVisible();

  await conferirEstrutura(page);

  await expect(page).toHaveScreenshot("caixa.png", { fullPage: true });
});

test("frente de caixa com a lista de sugestões aberta", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples", "/caixa");

  await page.goto("/caixa");
  await page.locator("#pos-query").pressSequentially("Caf", { delay: 60 });
  await expect(
    page.getByRole("listbox", { name: "Sugestões de produtos" }).locator("li"),
  ).not.toHaveCount(0);

  await conferirEstrutura(page);

  await expect(page).toHaveScreenshot("caixa-sugestoes.png", {
    fullPage: true,
  });
});

test("painel: layout, alvos e contraste", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples", "/dashboard");

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Sem foto: os números do Painel são do dia, e uma imagem de referência
  // aqui mudaria conforme o que a suíte já semeou.
  await conferirEstrutura(page);
});

test("estoque: layout, alvos e contraste", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples", "/estoque");

  await page.goto("/estoque");
  await expect(
    page.getByRole("heading", { name: "Estoque", level: 1 }),
  ).toBeVisible();

  await conferirEstrutura(page);
});

test("financeiro: layout, alvos e contraste", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples", "/financeiro");

  await page.goto("/financeiro");
  await expect(
    page.getByRole("heading", { name: "Financeiro", level: 1 }),
  ).toBeVisible();

  await conferirEstrutura(page);
});

test("celular no modo Minimalista mantém o padrão no caixa", async ({
  page,
}) => {
  test.skip(!ehMobile(), "só no projeto mobile");

  await usarModo(page, "minimalista", "/caixa");
  await page.goto("/caixa");
  await expect(
    page.getByRole("heading", { name: "Frente de caixa", level: 1 }),
  ).toBeVisible();

  await conferirEstrutura(page);
  await expect(page).toHaveScreenshot("caixa-minimalista.png", {
    fullPage: true,
  });

  await usarModo(page, "simples", "/caixa");
});
