import { describe, expect, it } from "vitest";

import { escaparLike, valorParaOr } from "@/lib/db/like";

/**
 * O curinga do LIKE não pode vazar do que o usuário digitou.
 *
 * Produtos e Estoque já escapavam; a frente de caixa e a busca de cliente
 * do fiado, não. Digitar `50%` na tela mais usada devolvia o catálogo
 * inteiro — não é falha de segurança (o PostgREST parametriza o valor), é
 * resultado errado na tela. Ver o achado E de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 */
describe("escaparLike", () => {
  it("neutraliza o % — o caso que devolvia o catálogo inteiro", () => {
    expect(escaparLike("50%")).toBe("50\\%");
  });

  it("neutraliza o _, que casa com qualquer caractere", () => {
    expect(escaparLike("cafe_500")).toBe("cafe\\_500");
  });

  it("dobra a própria barra invertida, senão ela escaparia o escape", () => {
    expect(escaparLike("a\\b")).toBe("a\\\\b");
    expect(escaparLike("100\\%")).toBe("100\\\\\\%");
  });

  it("não mexe no que não é curinga", () => {
    expect(escaparLike("Café Torrado 500g")).toBe("Café Torrado 500g");
    expect(escaparLike("")).toBe("");
  });

  it("escapar duas vezes NÃO é o mesmo que escapar uma — não reaplicar", () => {
    expect(escaparLike(escaparLike("50%"))).not.toBe(escaparLike("50%"));
  });
});

describe("valorParaOr", () => {
  it("protege a vírgula e o parêntese, que quebram a gramática do or()", () => {
    expect(valorParaOr("arroz, feijão")).toBe('"arroz, feijão"');
    expect(valorParaOr("kit (3un)")).toBe('"kit (3un)"');
  });

  it("escapa aspas e barra, que sairiam do delimitador", () => {
    expect(valorParaOr('cafe "forte"')).toBe('"cafe \\"forte\\""');
    expect(valorParaOr("a\\b")).toBe('"a\\\\b"');
  });

  it("compõe com escaparLike: um protege o SQL, o outro a query string", () => {
    // A ordem importa: escapa o curinga primeiro, delimita depois.
    expect(valorParaOr(escaparLike("50%, à vista"))).toBe(
      '"50\\\\%, à vista"',
    );
  });
});
