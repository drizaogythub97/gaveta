import { expect, test, type Page } from "@playwright/test";

import { STATE_VISUAL } from "../../playwright.config";

import { esperaContrasteAA } from "./a11y";

/**
 * Verificação visual da fase G3 (protocolo docs/09 §2): a tela de fechamento
 * não pode quebrar o layout nem fugir do padrão. Roda nos dois projetos —
 * `desktop` (Desktop Chrome) e `mobile` (Pixel 7) — e, no celular, também no
 * modo Minimalista.
 *
 * O usuário "visual" tem vendas SEMEADAS e fixas (auth.setup.ts): café com
 * custo conhecido e bolo sem custo, para a foto pegar o split E o aviso de
 * cobertura incompleta — o estado com mais informação na tela.
 */

test.use({ storageState: STATE_VISUAL });
test.describe.configure({ mode: "serial" });

const FECHAMENTO = "/financeiro?tab=fechamento&period=today";

function ehMobile(): boolean {
  return test.info().project.name === "mobile";
}

async function usarModo(page: Page, modo: "simples" | "minimalista") {
  await page.goto("/financeiro");
  await page.evaluate((valor) => {
    document.cookie = `gaveta_ui_mode=${valor}; path=/; max-age=31536000; samesite=lax`;
  }, modo);
}

async function escondeOverlayDoNext(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, #__next-build-watcher { display: none !important; }",
  });
}

async function semRolagemHorizontal(page: Page) {
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(estouro).toBeLessThanOrEqual(1);
}

/** Acessibilidade (docs/02): alvos de toque com pelo menos 44px de altura. */
async function alvosGrandes(page: Page) {
  const pequenos = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return [];
    const alvos = Array.from(
      main.querySelectorAll<HTMLElement>("button, input, select, a[href]"),
    );
    return alvos
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.className.includes("sr-only")) return false;
        const ehLinkDeTexto =
          el.tagName === "A" && !el.className.includes("h-1");
        return !ehLinkDeTexto && r.height < 44;
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
  });
  expect(pequenos).toEqual([]);
}

test("fechamento do dia: layout, alvos e regressão visual", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto(FECHAMENTO);
  await expect(
    page.getByRole("heading", { name: /Guardar para repor a mercadoria/ }),
  ).toBeVisible();

  // O estado semeado: 2 cafés a R$ 16,50 (custo R$ 9,90) + 1 bolo sem custo.
  await expect(page.getByRole("region", { name: /^Entrou/ })).toContainText(
    "R$ 63,00",
  );
  await expect(
    page.getByRole("region", { name: /Guardar para repor a mercadoria/ }),
  ).toContainText("R$ 19,80");
  await expect(page.getByRole("region", { name: /^Lucro$/ })).toContainText(
    "R$ 43,20",
  );
  // E o aviso de que parte do "lucro" ainda é recompra desconhecida.
  await expect(
    page.getByRole("heading", { name: "O lucro acima está por cima" }),
  ).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("fechamento.png", { fullPage: true });
});

test("fechamento sem venda no período explica o que aparece ali", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto(
    "/financeiro?tab=fechamento&period=custom&from=2020-01-01&to=2020-01-02",
  );
  await expect(page.getByText(/Nada entrou neste período/)).toBeVisible();

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("fechamento-vazio.png", {
    fullPage: true,
  });
});

test("celular no modo Minimalista mantém o padrão no fechamento", async ({
  page,
}) => {
  test.skip(
    !ehMobile(),
    "O modo Minimalista só existe em viewport de celular.",
  );

  await usarModo(page, "minimalista");
  await page.goto(FECHAMENTO);
  await expect(
    page.getByRole("heading", { name: /Guardar para repor a mercadoria/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-mode",
    "minimalista",
  );

  await escondeOverlayDoNext(page);
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);

  await expect(page).toHaveScreenshot("fechamento-minimalista.png", {
    fullPage: true,
  });
});
