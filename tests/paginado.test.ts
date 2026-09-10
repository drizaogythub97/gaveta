import { describe, expect, it } from "vitest";

import { todasAsLinhas } from "@/lib/db/paginado";

/**
 * O corte do PostgREST deixa de ser silencioso.
 *
 * Ele devolve no máximo 1000 linhas e não avisa: quem pedia `.limit(5000)`
 * recebia 1000 e seguia achando que tinha o conjunto inteiro. Ver o achado B
 * de `docs/10-ACHADOS-DE-LOGICA.md`.
 */

/** Banco de mentira que respeita `range` e o teto de 1000 por página. */
function bancoCom(total: number, aoPedir?: (de: number, ate: number) => void) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  return (de: number, ate: number) => {
    aoPedir?.(de, ate);
    const fim = Math.min(ate, de + 999);
    return Promise.resolve({ data: linhas.slice(de, fim + 1), error: null });
  };
}

describe("todasAsLinhas", () => {
  it("uma página basta quando cabe tudo", async () => {
    const pedidos: Array<[number, number]> = [];
    const { linhas, truncou } = await todasAsLinhas(
      bancoCom(196, (de, ate) => pedidos.push([de, ate])),
    );
    expect(linhas).toHaveLength(196);
    expect(truncou).toBe(false);
    expect(pedidos).toEqual([[0, 999]]);
  });

  it("passa do teto de 1000 — que era onde o dado sumia calado", async () => {
    const { linhas, truncou } = await todasAsLinhas(bancoCom(2500));
    expect(linhas).toHaveLength(2500);
    expect(truncou).toBe(false);
  });

  it("página cheia exata não engana: pede a seguinte para ter certeza", async () => {
    const pedidos: Array<[number, number]> = [];
    const { linhas } = await todasAsLinhas(
      bancoCom(1000, (de, ate) => pedidos.push([de, ate])),
    );
    expect(linhas).toHaveLength(1000);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("avisa quando bate no teto de segurança, em vez de cortar em silêncio", async () => {
    const { linhas, truncou } = await todasAsLinhas(bancoCom(9000), {
      maximo: 2000,
    });
    expect(linhas).toHaveLength(2000);
    expect(truncou).toBe(true);
  });

  it("erro do banco volta com o que já veio, sem inventar conjunto completo", async () => {
    const { linhas, erro, truncou } = await todasAsLinhas<{ id: number }>(
      (de) =>
        de === 0
          ? Promise.resolve({
              data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
              error: null,
            })
          : Promise.resolve({ data: null, error: { message: "timeout" } }),
    );
    expect(linhas).toHaveLength(1000);
    expect(erro).toBe("timeout");
    expect(truncou).toBe(false);
  });

  it("lista vazia não vira consulta a mais", async () => {
    const pedidos: Array<[number, number]> = [];
    const { linhas } = await todasAsLinhas(
      bancoCom(0, (de, ate) => pedidos.push([de, ate])),
    );
    expect(linhas).toEqual([]);
    expect(pedidos).toHaveLength(1);
  });
});
