import { describe, expect, it } from "vitest";

import { nomeNaLinha, nomesDeProduto } from "@/lib/compras/ocr-nomes";

/**
 * Extração dos nomes de produto do texto do OCR (plano 08, fase G2c).
 *
 * As linhas abaixo reproduzem o RUÍDO REAL medido numa nota de papel
 * digitalizada a ~90 DPI: nome legível em caixa alta, e as colunas de
 * número saindo como lixo. O documento em si não entra no repositório
 * (é público) — o que entra é o formato do estrago.
 */

const TEXTO_DO_OCR = [
  "Rouxinol Pedido",
  "11 5823-2458 Emitido em 26/08/26",
  "CLIENTE",
  "ADEMIR CARDOSO RACOES 25 07.638,939/0001-25",
  "EST DA AGUA ESPRAIADA, 2159 CAUCAIA DO ALTO [06725153",
  "VALORES",
  "121605 sanear 12100",
  "DADOS DOS PRODUTOS",
  "[esocomenmo [ sesemgtomomeno | ve vv, [aum worm] vmonTom] ve] coco",
  "er — leimassoLarAuDO amena NO [rosana lero [a] isaml  isamol Sresesssezoora |",
  "GIRASSOL MIUDO 10 KG [12060010 feto | aP sros| é úúsnoo|  fresesesazoaes |",
  "23 MISTURA DE CALOPSITA MIX 10/500 asossoio Fono | =| 5200]  Gneol —ranssosszneos |",
  "ese MISTURA DE CANARIO BELGA COMUM 10 KG [ooseoso ferro | al Canas mas] — Jreossosemeim |",
  "MISTURA DE HAMSTER 10/500G = —” jasonsoto foro [af sal = isso]  Ireesosazicos |",
  "ss ——— | MISTURA DE PAPAGAIO COM FRUTA Ie OD — [2a0seoto fnmo | a] sos] Canas] |",
  "OUTRAS INFORMAÇÕES )",
  "PIX 19 130,000",
  "TOTAL GERAL 1.216,05",
];

describe("nomeNaLinha", () => {
  it("pega o nome em caixa alta e descarta o lixo do OCR ao redor", () => {
    expect(
      nomeNaLinha(
        "GIRASSOL MIUDO 10 KG [12060010 feto | aP sros| é úúsnoo|  fresesesazoaes |",
      ),
    ).toBe("GIRASSOL MIUDO 10 KG");
  });

  it("ignora o código solto antes do nome", () => {
    expect(
      nomeNaLinha(
        "23 MISTURA DE CALOPSITA MIX 10/500 asossoio Fono | =| 5200]  Gneol |",
      ),
    ).toBe("23 MISTURA DE CALOPSITA MIX 10/500");
  });

  it("mantém os conectores no meio do nome", () => {
    expect(
      nomeNaLinha("ese MISTURA DE CANARIO BELGA COMUM 10 KG [ooseoso ferro |"),
    ).toBe("MISTURA DE CANARIO BELGA COMUM 10 KG");
  });

  it("não termina nem começa por conector solto", () => {
    expect(nomeNaLinha("xx MISTURA DE CANARIO DE aaaa bbbb")).toBe(
      "MISTURA DE CANARIO",
    );
  });

  it("uma palavra só não é nome confiável — prefere não devolver", () => {
    // Sobrando "MISTURA" depois de tirar o conector da ponta, não há
    // confiança suficiente: melhor a pessoa digitar do que receber um nome
    // pela metade e não perceber.
    expect(nomeNaLinha("xx MISTURA DE aaaa bbbb")).toBeNull();
  });

  it("recusa linha que é só ruído", () => {
    expect(
      nomeNaLinha("er — leimassoLarAuDO amena NO [rosana lero [a] isaml |"),
    ).toBeNull();
    expect(
      nomeNaLinha("[esocomenmo [ sesemgtomomeno | ve vv, [aum worm]"),
    ).toBeNull();
    expect(nomeNaLinha("")).toBeNull();
  });

  it("recusa cabeçalho de coluna", () => {
    expect(nomeNaLinha("CODIGO DESCRICAO DO PRODUTO NCM UN QUANT")).toBeNull();
    expect(nomeNaLinha("VALOR TOTAL DA NOTA")).toBeNull();
  });

  it("recusa sequência de números sem letra", () => {
    expect(nomeNaLinha("121605 12100 130,000")).toBeNull();
  });
});

describe("nomesDeProduto", () => {
  it("lê a lista do bloco de produtos de uma nota digitalizada", () => {
    expect(nomesDeProduto(TEXTO_DO_OCR)).toEqual([
      "GIRASSOL MIUDO 10 KG",
      "23 MISTURA DE CALOPSITA MIX 10/500",
      "MISTURA DE CANARIO BELGA COMUM 10 KG",
      "MISTURA DE HAMSTER 10/500G",
      "MISTURA DE PAPAGAIO COM FRUTA",
    ]);
  });

  it("não pega nada de fora do bloco de produtos", () => {
    const nomes = nomesDeProduto(TEXTO_DO_OCR);
    // O nome do cliente e o endereço estão em caixa alta ANTES do bloco.
    expect(nomes.join(" | ")).not.toContain("ADEMIR");
    expect(nomes.join(" | ")).not.toContain("AGUA ESPRAIADA");
    // E o rodapé depois do bloco também fica de fora.
    expect(nomes.join(" | ")).not.toContain("TOTAL GERAL");
  });

  it("sem o bloco de produtos, prefere não devolver nada a devolver lixo", () => {
    expect(
      nomesDeProduto(["ADEMIR CARDOSO RACOES", "EST DA AGUA ESPRAIADA, 2159"]),
    ).toEqual([]);
  });

  it("não repete o mesmo nome lido duas vezes", () => {
    expect(
      nomesDeProduto([
        "DADOS DOS PRODUTOS",
        "GIRASSOL MIUDO 10 KG [12060010 feto |",
        "GIRASSOL MIUDO 10 KG [12060010 feto |",
      ]),
    ).toEqual(["GIRASSOL MIUDO 10 KG"]);
  });
});
