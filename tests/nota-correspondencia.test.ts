import { describe, expect, it } from "vitest";

import {
  escolherProduto,
  normalizarNome,
  semelhanca,
  type ProdutoCatalogo,
} from "@/lib/compras/correspondencia";

/**
 * Motor de correspondência da nota importada (plano 08, fase G2b, §1.2.3).
 * A ligação por código de barras é exata e vive na action; aqui está a parte
 * que precisa de julgamento — casar o nome da nota com o do catálogo.
 */

const CATALOGO: ProdutoCatalogo[] = [
  { id: "p1", name: "Arroz 5kg", trackStock: true },
  { id: "p2", name: "Feijão carioca 1kg", trackStock: true },
  { id: "p3", name: "Açúcar cristal 1kg", trackStock: true },
  { id: "p4", name: "Marmita do dia", trackStock: false },
];

describe("normalizarNome", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(normalizarNome("Açúcar Cristal 1kg")).toBe("acucar cristal 1kg");
    expect(normalizarNome("FEIJÃO  CARIOCA - 1KG")).toBe("feijao carioca 1kg");
    expect(normalizarNome("Arroz")).toBe(normalizarNome("ARROZ"));
  });
});

describe("semelhanca", () => {
  it("dá 1 para o mesmo nome escrito de outro jeito", () => {
    expect(semelhanca("ACUCAR CRISTAL 1KG", "Açúcar cristal 1kg")).toBe(1);
  });

  it("reconhece o nome da nota mais detalhado que o do cadastro", () => {
    expect(semelhanca("ARROZ TIPO 1 5KG", "Arroz 5kg")).toBeGreaterThan(0.5);
  });

  it("não aproxima produtos diferentes", () => {
    expect(semelhanca("ARROZ 5KG", "Açúcar cristal 1kg")).toBeLessThan(0.5);
    expect(semelhanca("DETERGENTE NEUTRO", "Feijão carioca 1kg")).toBe(0);
  });

  it("separa variedades do mesmo produto", () => {
    // Compartilham "arroz", mas são produtos diferentes: fica abaixo do
    // limiar e o item entra como novo, em vez de somar no estoque errado.
    expect(semelhanca("ARROZ INTEGRAL 1KG", "Arroz 5kg")).toBeLessThan(0.5);
  });

  it("não deixa palavras genéricas aproximarem qualquer coisa", () => {
    // "1kg" sozinho não pode casar açúcar com feijão.
    expect(semelhanca("SAL REFINADO 1KG", "Açúcar cristal 1kg")).toBeLessThan(
      0.5,
    );
  });
});

describe("escolherProduto", () => {
  it("acha o produto quando o nome da nota é uma variação", () => {
    const achado = escolherProduto("ARROZ TIPO 1 5KG", CATALOGO);
    expect(achado?.id).toBe("p1");
  });

  it("acha mesmo com acento e caixa diferentes", () => {
    expect(escolherProduto("ACUCAR CRISTAL 1KG", CATALOGO)?.id).toBe("p3");
    expect(escolherProduto("FEIJAO CARIOCA 1KG", CATALOGO)?.id).toBe("p2");
  });

  it("devolve null quando nada chega perto — o item vira produto novo", () => {
    expect(escolherProduto("DETERGENTE NEUTRO 500ML", CATALOGO)).toBeNull();
    expect(escolherProduto("", CATALOGO)).toBeNull();
  });

  it("preserva se o produto controla estoque", () => {
    expect(escolherProduto("Marmita do dia", CATALOGO)?.trackStock).toBe(false);
    expect(escolherProduto("Arroz 5kg", CATALOGO)?.trackStock).toBe(true);
  });

  it("dá sempre o mesmo resultado para a mesma nota", () => {
    const primeira = escolherProduto("ARROZ TIPO 1 5KG", CATALOGO);
    const segunda = escolherProduto("ARROZ TIPO 1 5KG", CATALOGO);
    expect(primeira?.id).toBe(segunda?.id);
  });

  it("respeita um limiar mais exigente", () => {
    // Com limiar 1, só nome idêntico (depois de normalizado) passa.
    expect(escolherProduto("ARROZ TIPO 1 5KG", CATALOGO, 1)).toBeNull();
    expect(escolherProduto("ARROZ 5KG", CATALOGO, 1)?.id).toBe("p1");
  });
});
