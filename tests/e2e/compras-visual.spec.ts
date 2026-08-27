import { expect, test, type Page } from "@playwright/test";

import { STATE_VISUAL } from "../../playwright.config";

import { esperaContrasteAA } from "./a11y";

import { loadUsers } from "./helpers";

/**
 * Verificação visual da fase G2a (protocolo docs/09 §2): as telas novas não
 * podem quebrar o layout nem fugir do padrão. Roda nos dois projetos —
 * `desktop` (Desktop Chrome) e `mobile` (Pixel 7) — e, no celular, nos dois
 * modos: Simples e Minimalista.
 *
 * O usuário "visual" tem estado SEMEADO e fixo (uma nota de 2026-08-20), para
 * a regressão de screenshot não variar de uma execução para outra.
 */

test.use({ storageState: STATE_VISUAL });
test.describe.configure({ mode: "serial" });

// Nota sobre os baselines: em `fullPage`, elementos fixos (a barra inferior
// do Minimalista) aparecem na posição em que estavam na viewport — é assim
// que o Chrome tira a foto de página inteira. A posição é estável entre
// execuções, então a regressão continua válida.

const DATA_FIXA = "2026-08-20";

function ehMobile(): boolean {
  return test.info().project.name === "mobile";
}

/** Modo de exibição do celular (cookie por aparelho, como o tema). */
async function usarModo(page: Page, modo: "simples" | "minimalista") {
  await page.goto("/estoque");
  await page.evaluate((valor) => {
    document.cookie = `gaveta_ui_mode=${valor}; path=/; max-age=31536000; samesite=lax`;
  }, modo);
}

/** Deixa a tela previsível: data fixa e nada de foco piscando no campo. */
async function estabilizaFormulario(page: Page) {
  await page.locator("#issuedOn").fill(DATA_FIXA);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

/**
 * O indicador de desenvolvimento do Next (balãozinho "N Issues") flutua sobre
 * a página em `npm run dev` e não existe no build de produção — some da foto
 * para o mesmo baseline valer local e contra o Preview.
 */
async function escondeOverlayDoNext(page: Page) {
  await page.addStyleTag({
    content: "nextjs-portal, #__next-build-watcher { display: none !important; }",
  });
}

/**
 * Nenhuma tela pode rolar na horizontal — é o sintoma clássico de layout
 * quebrado no celular.
 */
async function semRolagemHorizontal(page: Page) {
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(estouro).toBeLessThanOrEqual(1);
}

/**
 * Acessibilidade (docs/02): alvos de toque com pelo menos 44px de altura.
 * Confere só o conteúdo da página (o cabeçalho e a barra inferior são do
 * layout, já validados em fases anteriores).
 */
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
        if (r.width === 0 || r.height === 0) return false; // invisível
        // Links de texto corrido (ex.: "Voltar ao estoque") não são alvos
        // de bloco; a regra de 44px vale para botões e campos.
        const ehLinkDeTexto =
          el.tagName === "A" && !el.className.includes("h-1");
        return !ehLinkDeTexto && r.height < 44;
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80));
  });
  expect(pequenos).toEqual([]);
}

test("entrada por nota: layout, alvos e regressão visual", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto("/estoque/compras/nova");
  await expect(
    page.getByRole("heading", { name: "Entrada por nota" }),
  ).toBeVisible();
  await estabilizaFormulario(page);
  await escondeOverlayDoNext(page);

  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);

  // O botão principal fica desabilitado até haver item — e a tela explica
  // que o valor vira gasto no Financeiro.
  await expect(
    page.getByRole("button", { name: "Conferir e lançar nota" }),
  ).toBeDisabled();
  await expect(page.getByText("insumos / mercadorias")).toBeVisible();

  await expect(page).toHaveScreenshot("nota-nova.png", { fullPage: true });
});

test("histórico de notas: layout, alvos e regressão visual", async ({
  page,
}) => {
  if (ehMobile()) await usarModo(page, "simples");

  await page.goto("/estoque/compras");
  await expect(
    page.getByRole("heading", { name: "Notas lançadas" }),
  ).toBeVisible();
  await expect(page.getByText("Distribuidora Modelo")).toBeVisible();
  await expect(page.getByText("20/08/2026")).toBeVisible();
  await expect(page.getByText("R$ 99,00")).toBeVisible();

  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);
  await escondeOverlayDoNext(page);

  await expect(page).toHaveScreenshot("nota-historico.png", {
    fullPage: true,
  });
});

test("detalhe da nota: layout e regressão visual", async ({ page }) => {
  if (ehMobile()) await usarModo(page, "simples");

  const { visualPurchaseId } = loadUsers();
  await page.goto(`/estoque/compras/${visualPurchaseId}`);
  await expect(
    page.getByRole("heading", { name: "Distribuidora Modelo" }),
  ).toBeVisible();
  await expect(page.getByText("Café torrado 500g")).toBeVisible();

  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);
  await escondeOverlayDoNext(page);

  await expect(page).toHaveScreenshot("nota-detalhe.png", { fullPage: true });
});

test("celular no modo Minimalista mantém o padrão", async ({ page }) => {
  test.skip(!ehMobile(), "O modo Minimalista só existe em viewport de celular.");

  await usarModo(page, "minimalista");
  await page.goto("/estoque/compras/nova");
  await expect(
    page.getByRole("heading", { name: "Entrada por nota" }),
  ).toBeVisible();
  await estabilizaFormulario(page);
  await escondeOverlayDoNext(page);

  // A escala densa do Minimalista está ativa (header encolhido pela variante).
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-mode",
    "minimalista",
  );
  await semRolagemHorizontal(page);
  await alvosGrandes(page);
  await esperaContrasteAA(page);
  await expect(page).toHaveScreenshot("nota-nova-minimalista.png", {
    fullPage: true,
  });

  await page.goto("/estoque/compras");
  await expect(page.getByText("Distribuidora Modelo")).toBeVisible();
  await semRolagemHorizontal(page);
  await escondeOverlayDoNext(page);
  await expect(page).toHaveScreenshot("nota-historico-minimalista.png", {
    fullPage: true,
  });
});
