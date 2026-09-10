import { describe, expect, it } from "vitest";

import { caminhoDeVoltaSeguro } from "@/lib/nav/voltar";

/**
 * O destino de volta vem da URL — é entrada de usuário. Sem validação, um
 * link com `?voltar=https://site-falso` usaria o endereço confiável do
 * Gaveta como trampolim para outro lugar (redirecionamento aberto). A regra
 * é alvo conhecido: só passa caminho interno previsto.
 */
describe("caminhoDeVoltaSeguro", () => {
  it("aceita as telas internas previstas, com query string", () => {
    expect(caminhoDeVoltaSeguro("/financeiro")).toBe("/financeiro");
    expect(
      caminhoDeVoltaSeguro("/financeiro?tab=fechamento&period=today"),
    ).toBe("/financeiro?tab=fechamento&period=today");
    expect(caminhoDeVoltaSeguro("/estoque/compras")).toBe("/estoque/compras");
    expect(caminhoDeVoltaSeguro("/produtos")).toBe("/produtos");
  });

  it("recusa endereço de fora, em qualquer disfarce", () => {
    expect(caminhoDeVoltaSeguro("https://site-falso.example")).toBeNull();
    // "//host" e "/\host" começam com barra mas são de OUTRO site.
    expect(caminhoDeVoltaSeguro("//site-falso.example")).toBeNull();
    expect(caminhoDeVoltaSeguro("/\\site-falso.example")).toBeNull();
    expect(caminhoDeVoltaSeguro("javascript:alert(1)")).toBeNull();
  });

  it("recusa caminho interno que não está na lista", () => {
    expect(caminhoDeVoltaSeguro("/minha-conta")).toBeNull();
    expect(caminhoDeVoltaSeguro("/auth/sign-out")).toBeNull();
    // Prefixo parecido não vale: /financeiro-falso não é /financeiro.
    expect(caminhoDeVoltaSeguro("/financeiro-falso")).toBeNull();
  });

  it("recusa quebra de linha e valor ausente", () => {
    expect(caminhoDeVoltaSeguro("/financeiro\nLocation: /outro")).toBeNull();
    expect(caminhoDeVoltaSeguro(undefined)).toBeNull();
    expect(caminhoDeVoltaSeguro("")).toBeNull();
  });

  it("com o parâmetro repetido na URL, considera o primeiro", () => {
    expect(caminhoDeVoltaSeguro(["/financeiro", "/produtos"])).toBe(
      "/financeiro",
    );
    expect(
      caminhoDeVoltaSeguro(["https://site-falso.example", "/financeiro"]),
    ).toBeNull();
  });
});
