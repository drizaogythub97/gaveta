// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  contasLiberadasParaIa,
  IaIndisponivel,
  iaLiberadaPara,
  IaSemProdutos,
  interpretarRespostaDaIa,
} from "@/lib/compras/ia-visao";

/**
 * Leitura de nota por IA de visão (plano 08, fase G2d).
 *
 * O que é testado aqui é a parte que decide o que entra no estoque: a
 * validação do que o modelo respondeu, e quem tem acesso à via. A chamada de
 * rede em si é exercitada no e2e — aqui não se gasta cota.
 *
 * Premissa que orienta tudo: o esquema estruturado garante o FORMATO, não o
 * VALOR. O modelo erra "bonito".
 */

const AMBIENTE = { ...process.env };
afterEach(() => {
  process.env = { ...AMBIENTE };
});

/** Resposta boa, no formato que a API devolve. */
function respostaBoa() {
  return {
    fornecedor: "Distribuidora Modelo",
    chaveAcesso: null,
    emitidaEm: "2026-08-26",
    total: 100,
    itens: [
      {
        descricao: "ARROZ 5KG",
        barcode: "7891000000015",
        quantidade: 2,
        custoUnitario: 25,
        totalLinha: 50,
      },
      {
        descricao: "FEIJAO 1KG",
        barcode: null,
        quantidade: 5,
        custoUnitario: 10,
        totalLinha: 50,
      },
    ],
  };
}

describe("liberação da via de IA", () => {
  it("só libera quem está na lista E com a chave configurada", () => {
    process.env.GEMINI_API_KEY = "chave-de-teste";
    process.env.IA_VISAO_LIBERADA_PARA = "abc-123, def-456";

    expect(iaLiberadaPara("abc-123")).toBe(true);
    expect(iaLiberadaPara("def-456")).toBe(true);
    expect(iaLiberadaPara("outro-usuario")).toBe(false);
  });

  it("sem chave configurada, a via não existe para ninguém", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.IA_VISAO_LIBERADA_PARA = "abc-123";
    expect(iaLiberadaPara("abc-123")).toBe(false);
  });

  it("sem lista, ninguém entra — o padrão é fechado", () => {
    process.env.GEMINI_API_KEY = "chave-de-teste";
    delete process.env.IA_VISAO_LIBERADA_PARA;
    expect(contasLiberadasParaIa()).toEqual([]);
    expect(iaLiberadaPara("abc-123")).toBe(false);
  });

  it("ignora espaços e entradas vazias na lista", () => {
    process.env.IA_VISAO_LIBERADA_PARA = " abc-123 ,, def-456 ,";
    expect(contasLiberadasParaIa()).toEqual(["abc-123", "def-456"]);
  });
});

describe("interpretarRespostaDaIa", () => {
  it("converte uma resposta boa", () => {
    const { nota, somaConfere } = interpretarRespostaDaIa(respostaBoa());

    expect(nota.origem).toBe("ia");
    expect(nota.fornecedor).toBe("Distribuidora Modelo");
    expect(nota.emitidaEm).toBe("2026-08-26");
    expect(nota.itens).toHaveLength(2);
    expect(nota.itens[0]!.custoUnitario).toBe(25);
    expect(nota.itens[0]!.barcode).toBe("7891000000015");
    // 50 + 50 = 100, o total declarado.
    expect(somaConfere).toBe(true);
  });

  it("avisa quando a soma das linhas NÃO fecha com o total", () => {
    const r = respostaBoa();
    r.total = 250; // o documento diz 250, mas as linhas somam 100
    expect(interpretarRespostaDaIa(r).somaConfere).toBe(false);
  });

  it("não tenta conferir a soma quando falta informação", () => {
    const semTotal = { ...respostaBoa(), total: null };
    expect(interpretarRespostaDaIa(semTotal).somaConfere).toBeNull();

    const semLinha = respostaBoa();
    semLinha.itens[0]!.totalLinha = null as unknown as number;
    expect(interpretarRespostaDaIa(semLinha).somaConfere).toBeNull();
  });

  it("tolera arredondamento de centavo do próprio documento", () => {
    const r = respostaBoa();
    r.total = 100.01;
    expect(interpretarRespostaDaIa(r).somaConfere).toBe(true);
  });

  it("descarta valor absurdo em vez de deixá-lo entrar no estoque", () => {
    const r = respostaBoa();
    r.itens[0]!.custoUnitario = 99_999_999; // acima do teto
    r.itens[1]!.quantidade = -3; // negativo
    const { nota } = interpretarRespostaDaIa(r);
    expect(nota.itens[0]!.custoUnitario).toBeNull();
    // Quantidade inválida vira 1, que é visível na tela e a pessoa corrige —
    // diferente de um custo inventado, que passaria despercebido.
    expect(nota.itens[1]!.quantidade).toBe(1);
  });

  it("descarta chave de acesso e código de barras fora do formato", () => {
    const r = { ...respostaBoa(), chaveAcesso: "123" };
    r.itens[0]!.barcode = "não é código";
    const { nota } = interpretarRespostaDaIa(r);
    expect(nota.chaveAcesso).toBeNull();
    expect(nota.itens[0]!.barcode).toBeNull();
  });

  it("aceita a chave com pontuação, guardando só os 44 dígitos", () => {
    const chave = "3526".repeat(11); // 44 dígitos
    const r = {
      ...respostaBoa(),
      chaveAcesso: chave.replace(/(.{4})/g, "$1 ").trim(),
    };
    expect(interpretarRespostaDaIa(r).nota.chaveAcesso).toBe(chave);
  });

  it("descarta data fora do formato", () => {
    const r = { ...respostaBoa(), emitidaEm: "26/08/2026" };
    expect(interpretarRespostaDaIa(r).nota.emitidaEm).toBeNull();
  });

  it("recusa resposta sem itens", () => {
    expect(() =>
      interpretarRespostaDaIa({ ...respostaBoa(), itens: [] }),
    ).toThrow(IaSemProdutos);
  });

  it("recusa resposta que não tem a forma esperada", () => {
    expect(() => interpretarRespostaDaIa(null)).toThrow(IaIndisponivel);
    expect(() => interpretarRespostaDaIa("uma frase")).toThrow(IaIndisponivel);
    expect(() => interpretarRespostaDaIa({ itens: "não é lista" })).toThrow(
      IaIndisponivel,
    );
    // Item sem descrição não dá para conferir nem cadastrar.
    expect(() =>
      interpretarRespostaDaIa({ itens: [{ quantidade: 1 }] }),
    ).toThrow(IaIndisponivel);
  });
});
