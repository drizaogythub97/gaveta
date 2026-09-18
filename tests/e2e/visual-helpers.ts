import { expect, type Page, test } from "@playwright/test";

/**
 * Auxiliares das verificações visuais (protocolo docs/09 §2).
 *
 * Estavam copiados em cada spec visual, com as cópias já divergindo entre
 * si nos comentários. Agora moram aqui, para a regra ser uma só: se um dia
 * mudar o que "alvo grande" significa, muda num lugar.
 */

export function ehMobile(): boolean {
  return test.info().project.name === "mobile";
}

/** Grava o cookie do modo de exibição. A rota só serve para ter uma página. */
export async function usarModo(
  page: Page,
  modo: "simples" | "minimalista",
  rota = "/dashboard",
) {
  await page.goto(rota);
  await page.evaluate((valor) => {
    document.cookie = `gaveta_ui_mode=${valor}; path=/; max-age=31536000; samesite=lax`;
  }, modo);
}

export async function escondeOverlayDoNext(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, #__next-build-watcher { display: none !important; }",
  });
}

/**
 * A página não rola de lado.
 *
 * Esta é a verificação que faltava na frente de caixa: em 1280px exatos o
 * conteúdo começava 26px à esquerda da tela, com o "F" de "Frente de caixa"
 * fora dela. O projeto `desktop` roda exatamente a 1280px — a falha estava
 * debaixo da câmera, faltava apontá-la para essa tela. Ver o achado H de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 */
export async function semRolagemHorizontal(page: Page) {
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(estouro).toBeLessThanOrEqual(1);
}

/** Acessibilidade (docs/02): alvos de toque com pelo menos 44px de altura. */
export async function alvosGrandes(page: Page) {
  const pequenos = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return [];
    const alvos = Array.from(
      main.querySelectorAll<HTMLElement>("button, input, select, a[href]"),
    );
    return alvos
      .filter((el) => {
        // Quem recebe o toque pode ser o RÓTULO em volta, não o campo.
        // A caixa de seleção "só estoque baixo" tem 22px, mas mora dentro
        // de um <label> de 54px de altura que ocupa a linha inteira: tocar
        // em qualquer ponto dele marca a caixa. Medir o campo sozinho
        // acusaria um problema que não existe.
        const alvo = el.closest("label") ?? el;
        const r = alvo.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false; // invisível
        // Elementos só para leitor de tela (ex.: o input[type=file] atrás do
        // botão "Escolher arquivo da nota") não recebem toque: quem é alvo
        // de ponteiro é o botão visível, e esse sim é medido aqui.
        if (el.className.includes("sr-only")) return false;
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
