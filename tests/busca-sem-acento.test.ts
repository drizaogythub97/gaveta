import { describe, expect, it } from "vitest";

import {
  normalizarBusca,
  ordenarPorSemelhanca,
  padraoNomeExato,
  padraoSemAcento,
  parecidos,
  sugerir,
  termosDaBusca,
} from "@/lib/db/busca";

/**
 * Busca por pedaço do nome, sem acento e em qualquer ordem.
 *
 * O filtro de verdade roda no Postgres (`~*`); aqui o mesmo padrão é
 * conferido com o RegExp do JavaScript, que para classes de letras e escape
 * de pontuação lê igual. O e2e `busca-sem-acento.spec.ts` prova o caminho
 * inteiro contra o banco.
 */
function casa(padrao: string, texto: string): boolean {
  return new RegExp(padrao, "i").test(texto);
}

describe("normalizarBusca", () => {
  it("tira acento, til e cedilha e ignora a caixa", () => {
    expect(normalizarBusca("Ração")).toBe("racao");
    expect(normalizarBusca("PÃO DE AÇÚCAR")).toBe("pao de acucar");
    expect(normalizarBusca("José")).toBe(normalizarBusca("JOSE"));
  });
});

describe("termosDaBusca", () => {
  it("quebra em palavras, sem espaço sobrando nem repetição", () => {
    expect(termosDaBusca("  Maria   SOUZA ")).toEqual(["maria", "souza"]);
    expect(termosDaBusca("arroz Arroz")).toEqual(["arroz"]);
  });

  it("deixa de fora as palavras de ligação", () => {
    // Quem digita "ração de filhote" quer "Ração Filhotes", que não tem "de".
    expect(termosDaBusca("ração de filhote")).toEqual(["racao", "filhote"]);
    expect(termosDaBusca("José da Silva")).toEqual(["jose", "silva"]);
  });

  it("mas não some com a busca que é só ligação — ainda se está digitando", () => {
    expect(termosDaBusca("de")).toEqual(["de"]);
  });

  it("mantém a pontuação dentro da palavra (o 50% do achado E)", () => {
    expect(termosDaBusca("50%")).toEqual(["50%"]);
    expect(termosDaBusca("cafe_500")).toEqual(["cafe_500"]);
  });

  it("busca vazia não tem termo", () => {
    expect(termosDaBusca("   ")).toEqual([]);
  });

  it("tem teto de palavras e de letras", () => {
    expect(termosDaBusca("a b c d e2 f g h i j")).toHaveLength(6);
    expect(termosDaBusca("x".repeat(200))[0]).toHaveLength(60);
  });
});

describe("padraoSemAcento", () => {
  it("troca cada vogal, o ç e o ñ pela classe com as variantes", () => {
    expect(padraoSemAcento("acai")).toBe(
      "[aáàâãä][cç][aáàâãä][iíìîï]",
    );
  });

  it("aceita a palavra com ou sem acento e gera o mesmo padrão", () => {
    expect(padraoSemAcento("Ração")).toBe(padraoSemAcento("racao"));
  });

  it("acha o registro acentuado digitando sem acento, e o contrário", () => {
    expect(casa(padraoSemAcento("racao"), "Ração Filhotes 15kg")).toBe(true);
    expect(casa(padraoSemAcento("racao"), "RAÇAO FILHOTES")).toBe(true);
    expect(casa(padraoSemAcento("conceição"), "da Conceicao")).toBe(true);
    expect(casa(padraoSemAcento("acucar"), "PÃO DE AÇÚCAR")).toBe(true);
  });

  it("não vira curinga: a letra continua sendo aquela letra", () => {
    expect(casa(padraoSemAcento("cafe"), "Cofe")).toBe(false);
    expect(casa(padraoSemAcento("joao"), "Joana")).toBe(false);
  });

  it("escapa a pontuação, que vale literal", () => {
    expect(padraoSemAcento("50%")).toBe("50\\%");
    expect(casa(padraoSemAcento("1.5l"), "Refri 1.5L")).toBe(true);
    // O ponto escapado não casa com qualquer caractere.
    expect(casa(padraoSemAcento("1.5l"), "Refri 105L")).toBe(false);
  });
});

describe("padraoNomeExato", () => {
  const padrao = padraoNomeExato("cafe  torrado");

  it("casa o nome inteiro sem acento, sem caixa e com espaço a mais", () => {
    expect(casa(padrao, "Café Torrado")).toBe(true);
    expect(casa(padrao, "CAFÉ TORRADO")).toBe(true);
    expect(casa(padrao, " café   torrado ")).toBe(true);
  });

  it("não casa nome que só COMEÇA igual", () => {
    expect(casa(padrao, "Café Torrado 500g")).toBe(false);
    expect(casa(padrao, "Torrado Café")).toBe(false);
  });

  it("casa o nome com % literalmente (Enter do caixa)", () => {
    expect(casa(padraoNomeExato("Zcuringa 50% desconto"), "Zcuringa 50% desconto")).toBe(true);
    expect(casa(padraoNomeExato("Zcuringa 50% desconto"), "Zcuringa 500 desconto")).toBe(false);
  });
});

describe("parecidos (erro de digitação)", () => {
  const nome = (s: string) => s;
  const achar = (itens: string[], busca: string) =>
    parecidos(itens, busca, nome);

  it("perdoa uma letra trocada, faltando, sobrando ou invertida", () => {
    expect(achar(["Maria Aparecida", "Mario", "Marta"], "maira")).toEqual([
      "Maria Aparecida",
    ]);
    expect(achar(["Arroz Tio João 5kg", "Feijão"], "aroz")).toEqual([
      "Arroz Tio João 5kg",
    ]);
    expect(achar(["Biscoito Recheado", "Bisnaguinha"], "biscoto")).toEqual([
      "Biscoito Recheado",
    ]);
  });

  it("junta grafias que soam igual", () => {
    expect(achar(["Maria Souza"], "sousa")).toEqual(["Maria Souza"]);
    expect(achar(["Tiago Silva"], "thiago")).toEqual(["Tiago Silva"]);
    expect(achar(["Rafael Santos"], "raphael")).toEqual(["Rafael Santos"]);
    expect(achar(["Cátia"], "katia")).toEqual(["Cátia"]);
    expect(achar(["José da Conceição"], "conseissao")).toEqual([
      "José da Conceição",
    ]);
  });

  it("acha enquanto se digita, mesmo com a letra errada no começo", () => {
    expect(achar(["Biscoito Recheado"], "bisxoi")).toEqual([
      "Biscoito Recheado",
    ]);
  });

  it("acha a palavra escrita colada", () => {
    expect(achar(["Coca Cola 2L"], "cocacola")).toEqual(["Coca Cola 2L"]);
  });

  it("não inventa parentesco", () => {
    expect(achar(["Ana"], "jo")).toEqual([]);
    // Duas letras de diferença numa palavra de 6 é outra pessoa.
    expect(achar(["Marcos"], "carlos")).toEqual([]);
    expect(achar(["Arroz", "Feijão"], "xyzw")).toEqual([]);
    // Toda palavra digitada precisa ter par.
    expect(achar(["Maria Souza"], "maira lima")).toEqual([]);
    // Palavra curta só casa inteira: "50%" não puxa o "500" (achado E).
    expect(achar(["Zcuringa cafe_500"], "50%")).toEqual([]);
  });

  it("o mais parecido vem primeiro", () => {
    expect(achar(["Mariana", "Maria"], "maria")).toEqual(["Maria", "Mariana"]);
  });
});

describe("sugerir", () => {
  const nome = (s: string) => s;

  it("sem nada exato, traz os parecidos", () => {
    expect(
      sugerir(["Biscoito Recheado", "Biscoito de Arroz", "Bisnaguinha"], "biscoto", nome, 8),
    ).toEqual(["Biscoito de Arroz", "Biscoito Recheado"]);
  });

  it("o exato vem antes e o parecido completa a lista", () => {
    expect(sugerir(["Marina", "Maria Souza"], "maria", nome, 8)).toEqual([
      "Maria Souza",
      "Marina",
    ]);
    expect(sugerir(["Marina", "Maria Souza"], "maria", nome, 1)).toEqual([
      "Maria Souza",
    ]);
  });
});

describe("ordenarPorSemelhanca", () => {
  const nome = (s: string) => s;

  it("põe na frente o que começa com o que se digitou", () => {
    const produtos = [
      "Biscoito de arroz",
      "Arroz integral",
      "Farinha de arroz",
      "Arroz 5kg",
    ];
    expect(ordenarPorSemelhanca(produtos, "arroz", nome)).toEqual([
      "Arroz 5kg",
      "Arroz integral",
      "Biscoito de arroz",
      "Farinha de arroz",
    ]);
  });

  it("começo de palavra vale mais que meio de palavra", () => {
    const nomes = ["Aparecida", "Cida Souza"];
    expect(ordenarPorSemelhanca(nomes, "cida", nome)).toEqual([
      "Cida Souza",
      "Aparecida",
    ]);
  });

  it("ignora acento ao comparar e mantém o texto original", () => {
    expect(ordenarPorSemelhanca(["Feijão", "Ração"], "racao", nome)).toEqual([
      "Ração",
      "Feijão",
    ]);
  });
});
