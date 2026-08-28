import { describe, expect, it } from "vitest";

import {
  calcularFechamento,
  LUCRO_CUSTO_ZERO,
  type LucroCustoRow,
} from "@/lib/financeiro/lucro-custo";

/**
 * Aritmética de apresentação do fechamento (plano 08, seção 2 — fase G3).
 * A agregação é do banco; aqui se garante que a conta mostrada ao dono
 * bate, inclusive nos casos que mais confundem (taxa, cobertura parcial).
 */

function linha(parcial: Partial<LucroCustoRow>): LucroCustoRow {
  return { ...LUCRO_CUSTO_ZERO, ...parcial };
}

describe("calcularFechamento", () => {
  it("separa recebido, custo e lucro", () => {
    const f = calcularFechamento(
      linha({
        recebido_vista: 500,
        custo_vista: 320,
        base_vista: 500,
        base_coberta_vista: 500,
      }),
    );
    expect(f.recebido).toBe(500);
    expect(f.custo).toBe(320);
    expect(f.lucro).toBe(180);
    expect(f.cobertura).toBe(1);
    expect(f.valorSemCusto).toBe(0);
  });

  it("tira a taxa do lucro e deixa o custo intacto", () => {
    const f = calcularFechamento(
      linha({
        recebido_vista: 500,
        taxas: 12,
        custo_vista: 320,
        base_vista: 500,
        base_coberta_vista: 500,
      }),
    );
    expect(f.custo).toBe(320); // o valor de recompra não muda
    expect(f.lucro).toBe(168); // 500 − 12 − 320
  });

  it("soma o recebido de vendas a prazo ao do caixa", () => {
    const f = calcularFechamento(
      linha({
        recebido_vista: 100,
        custo_vista: 40,
        base_vista: 100,
        base_coberta_vista: 100,
        recebido_fiado: 50,
        custo_fiado: 20,
        base_fiado: 50,
        base_coberta_fiado: 50,
      }),
    );
    expect(f.recebidoVista).toBe(100);
    expect(f.recebidoFiado).toBe(50);
    expect(f.recebido).toBe(150);
    expect(f.custo).toBe(60);
    expect(f.lucro).toBe(90);
  });

  it("calcula a cobertura e o valor que falta ter custo", () => {
    const f = calcularFechamento(
      linha({
        recebido_vista: 100,
        custo_vista: 30,
        base_vista: 100,
        base_coberta_vista: 75,
      }),
    );
    expect(f.cobertura).toBe(0.75);
    expect(f.valorSemCusto).toBe(25);
    // O lucro fica otimista de propósito: o item sem custo não é chutado.
    expect(f.lucro).toBe(70);
  });

  it("cobertura é nula quando não houve venda no período", () => {
    const f = calcularFechamento(LUCRO_CUSTO_ZERO);
    expect(f.cobertura).toBeNull();
    expect(f.recebido).toBe(0);
    expect(f.lucro).toBe(0);
    expect(f.valorSemCusto).toBe(0);
  });

  it("arredonda em centavos, sem sobra de ponto flutuante", () => {
    const f = calcularFechamento(
      linha({
        recebido_vista: 10.1,
        recebido_fiado: 0.2,
        custo_vista: 3.3,
        base_vista: 10.1,
        base_coberta_vista: 10.1,
      }),
    );
    expect(f.recebido).toBe(10.3);
    expect(f.lucro).toBe(7);
  });

  it("nunca devolve valor negativo de 'falta custo'", () => {
    // Defensivo: base coberta não deveria passar da base, mas se passar por
    // arredondamento, a tela não pode mostrar "faltam −R$ 0,01".
    const f = calcularFechamento(
      linha({ base_vista: 10, base_coberta_vista: 10.004 }),
    );
    expect(f.valorSemCusto).toBe(0);
  });

  it("aceita valores que chegam como texto do banco", () => {
    // O PostgREST devolve numeric como string; a conta não pode virar
    // concatenação ("100" + "50" = "10050").
    const f = calcularFechamento({
      ...LUCRO_CUSTO_ZERO,
      recebido_vista: "100" as unknown as number,
      recebido_fiado: "50" as unknown as number,
      custo_vista: "40" as unknown as number,
    });
    expect(f.recebido).toBe(150);
    expect(f.custo).toBe(40);
    expect(f.lucro).toBe(110);
  });
});
