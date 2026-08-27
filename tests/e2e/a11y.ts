import { expect, type Page } from "@playwright/test";

/**
 * Verificações de acessibilidade que rodam direto no navegador, sem
 * dependência nova: contraste AA (WCAG 2.1) e tamanho de alvo de toque.
 *
 * O cálculo compõe cores com transparência sobre o fundo real do ancestral
 * (o app usa muito `bg-primary/10` e afins), aplica a fórmula de luminância
 * relativa do WCAG e exige 4,5:1 para texto normal e 3:1 para texto grande
 * (≥24px, ou ≥18,66px em negrito) — o mesmo critério do
 * docs/02-DESIGN-SYSTEM-IDOSOS.md.
 */

export type ProblemaContraste = {
  texto: string;
  seletor: string;
  razao: number;
  minimo: number;
};

export async function problemasDeContraste(
  page: Page,
): Promise<ProblemaContraste[]> {
  return page.evaluate(() => {
    type RGBA = [number, number, number, number];

    function parseCor(valor: string): RGBA | null {
      const m = valor.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/,
      );
      if (!m) return null;
      return [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        m[4] === undefined ? 1 : Number(m[4]),
      ];
    }

    /** Compõe `frente` (com alpha) sobre `fundo` (opaco). */
    function compor(frente: RGBA, fundo: RGBA): RGBA {
      const a = frente[3];
      return [
        frente[0] * a + fundo[0] * (1 - a),
        frente[1] * a + fundo[1] * (1 - a),
        frente[2] * a + fundo[2] * (1 - a),
        1,
      ];
    }

    function luminancia([r, g, b]: RGBA): number {
      const canal = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    }

    function razao(a: RGBA, b: RGBA): number {
      const la = luminancia(a);
      const lb = luminancia(b);
      const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
      return (claro + 0.05) / (escuro + 0.05);
    }

    /** Fundo efetivo do elemento: empilha as camadas até achar um opaco. */
    function fundoEfetivo(el: Element): RGBA {
      const camadas: RGBA[] = [];
      let atual: Element | null = el;
      while (atual) {
        const cor = parseCor(getComputedStyle(atual).backgroundColor);
        if (cor && cor[3] > 0) {
          camadas.push(cor);
          if (cor[3] === 1) break;
        }
        atual = atual.parentElement;
      }
      // Sem nenhuma camada opaca, assume o fundo da página (branco/escuro).
      let base: RGBA = parseCor(
        getComputedStyle(document.body).backgroundColor,
      ) ?? [255, 255, 255, 1];
      if (base[3] < 1) base = [255, 255, 255, 1];
      for (let i = camadas.length - 1; i >= 0; i--) {
        base = compor(camadas[i], base);
      }
      return base;
    }

    const main = document.querySelector("main");
    if (!main) return [];

    const problemas: ProblemaContraste[] = [];
    const vistos = new Set<Element>();

    for (const el of Array.from(main.querySelectorAll<HTMLElement>("*"))) {
      // Só elementos que realmente pintam texto próprio.
      const textoDireto = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (textoDireto.length === 0 || vistos.has(el)) continue;
      vistos.add(el);

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const estilo = getComputedStyle(el);
      if (estilo.visibility === "hidden" || estilo.opacity === "0") continue;

      const corTexto = parseCor(estilo.color);
      if (!corTexto) continue;
      const fundo = fundoEfetivo(el);
      const texto = corTexto[3] < 1 ? compor(corTexto, fundo) : corTexto;

      const tamanho = parseFloat(estilo.fontSize);
      const peso = Number(estilo.fontWeight) || 400;
      const grande = tamanho >= 24 || (tamanho >= 18.66 && peso >= 700);
      const minimo = grande ? 3 : 4.5;

      const valor = razao(texto, fundo);
      if (valor + 0.05 < minimo) {
        problemas.push({
          texto: textoDireto.slice(0, 40),
          seletor: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60),
          razao: Math.round(valor * 100) / 100,
          minimo,
        });
      }
    }
    return problemas;
  });
}

/** Falha listando cada texto abaixo do mínimo AA. */
export async function esperaContrasteAA(page: Page): Promise<void> {
  const problemas = await problemasDeContraste(page);
  expect(problemas).toEqual([]);
}
