import { describe, expect, it } from "vitest";

import {
  agruparVendasDoDia,
  calcularDia,
  type VendaDoDiaRow,
} from "@/lib/financeiro/lucro-custo";

/**
 * Aritmética do fechamento dia a dia. A agregação é do banco (RPCs
 * `fechamento_por_dia` e `fechamento_vendas_do_dia`); aqui se garante que o
 * que a tela mostra a partir dela está certo — em especial as duas regras
 * que mais confundem: a taxa sai do lucro (nunca do custo) e o item sem
 * custo não é chutado, só sinalizado.
 */

function linhaDia(parcial: Partial<Parameters<typeof calcularDia>[0]> = {}) {
  return {
    dia: "2026-08-30",
    recebido: 0,
    taxas: 0,
    custo: 0,
    base: 0,
    base_coberta: 0,
    vendas: 0,
    recebido_fiado: 0,
    ...parcial,
  };
}

describe("calcularDia", () => {
  it("separa recebido, custo e lucro do dia", () => {
    const d = calcularDia(
      linhaDia({ recebido: 400, custo: 150, base: 400, base_coberta: 400, vendas: 3 }),
    );
    expect(d.recebido).toBe(400);
    expect(d.custo).toBe(150);
    expect(d.lucro).toBe(250);
    expect(d.vendas).toBe(3);
    expect(d.cobertura).toBe(1);
  });

  it("tira a taxa do lucro e deixa o custo intacto", () => {
    const d = calcularDia(
      linhaDia({ recebido: 100, taxas: 3, custo: 40, base: 100, base_coberta: 100 }),
    );
    expect(d.custo).toBe(40);
    expect(d.lucro).toBe(57);
  });

  it("marca cobertura parcial quando parte do vendido não tem custo", () => {
    const d = calcularDia(
      linhaDia({ recebido: 100, custo: 20, base: 100, base_coberta: 60 }),
    );
    expect(d.cobertura).toBeCloseTo(0.6, 5);
  });

  it("não inventa cobertura em dia sem venda", () => {
    expect(calcularDia(linhaDia({ recebido: 0 })).cobertura).toBeNull();
  });

  it("guarda a data como texto puro, sem passar por Date", () => {
    // "2026-08-01" em `new Date` é meia-noite UTC e, no fuso do Brasil,
    // voltaria para 31/07.
    expect(calcularDia(linhaDia({ dia: "2026-08-01" })).dia).toBe("2026-08-01");
  });
});

function item(parcial: Partial<VendaDoDiaRow>): VendaDoDiaRow {
  return {
    sale_id: "venda-1",
    origem: "caixa",
    vendida_em: "2026-08-30T12:00:00.000Z",
    metodo: "dinheiro",
    taxa: 0,
    item_id: "item-1",
    nome: "Arroz",
    quantidade: 1,
    valor: 10,
    custo: 4,
    ...parcial,
  };
}

describe("agruparVendasDoDia", () => {
  it("junta os itens da mesma venda e soma valor, custo e lucro", () => {
    const [venda] = agruparVendasDoDia([
      item({ item_id: "a", nome: "Arroz", quantidade: 2, valor: 20, custo: 8 }),
      item({ item_id: "b", nome: "Feijão", quantidade: 1, valor: 20, custo: 7 }),
    ]);
    expect(venda.itens).toHaveLength(2);
    expect(venda.valor).toBe(40);
    expect(venda.custo).toBe(15);
    expect(venda.lucro).toBe(25);
    expect(venda.temItemSemCusto).toBe(false);
  });

  it("desconta a taxa do lucro da venda, não do custo", () => {
    const [venda] = agruparVendasDoDia([
      item({ taxa: 2, valor: 20, custo: 7, metodo: "credito_avista" }),
    ]);
    expect(venda.custo).toBe(7);
    expect(venda.lucro).toBe(11);
  });

  it("sinaliza o item sem custo em vez de contá-lo como zero", () => {
    const [venda] = agruparVendasDoDia([
      item({ item_id: "a", valor: 10, custo: 4 }),
      item({ item_id: "b", nome: "Bolo", valor: 30, custo: null }),
    ]);
    // O custo conhecido é só o do primeiro item; o lucro fica por cima e a
    // tela precisa dizer isso.
    expect(venda.custo).toBe(4);
    expect(venda.temItemSemCusto).toBe(true);
    expect(venda.lucro).toBe(36);
  });

  it("separa vendas diferentes e mostra a mais recente primeiro", () => {
    const vendas = agruparVendasDoDia([
      item({ sale_id: "antiga", vendida_em: "2026-08-30T09:00:00.000Z" }),
      item({ sale_id: "recente", vendida_em: "2026-08-30T18:00:00.000Z" }),
    ]);
    expect(vendas.map((v) => v.id)).toEqual(["recente", "antiga"]);
  });

  it("marca a quitação de venda a prazo como origem fiado", () => {
    const [venda] = agruparVendasDoDia([
      item({ origem: "fiado", metodo: "fiado", valor: 5, custo: 2 }),
    ]);
    expect(venda.origem).toBe("fiado");
  });
});
