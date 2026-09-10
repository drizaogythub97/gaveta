import { describe, expect, it, afterEach, vi } from "vitest";

import {
  FUSO_LOJA,
  dayEndISO,
  dayStartISO,
  formatDate,
  formatDateTime,
  hojeNaLoja,
  monthStartISO,
  periodTimeZone,
  rangeForPeriod,
  toDateInputValue,
  todayStartISO,
} from "@/lib/dashboard/dates";

/**
 * O dia do lojista vira à meia-noite de BRASÍLIA.
 *
 * Antes, as bordas saíam no fuso do servidor — UTC na Vercel —, então o dia
 * virava às 21h e a venda da noite caía no relatório do dia seguinte. Estes
 * testes fixam o relógio em instantes que só passam se a conta for feita no
 * fuso da loja; rodando a suíte em qualquer máquina, com qualquer TZ.
 *
 * Brasília é UTC-3 e não tem horário de verão desde 2019: meia-noite na loja
 * é 03:00Z do MESMO dia, e o fim do dia é 02:59:59.999Z do dia seguinte.
 */

afterEach(() => {
  vi.useRealTimers();
});

/** Congela o relógio num instante absoluto (ISO com Z). */
function em(instanteISO: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instanteISO));
}

describe("fuso da loja", () => {
  it("é fixo em America/Sao_Paulo, e é o mesmo que vai ao banco", () => {
    expect(FUSO_LOJA).toBe("America/Sao_Paulo");
    expect(periodTimeZone()).toBe(FUSO_LOJA);
  });

  it("às 21h30 de Brasília ainda é o mesmo dia — era aqui que virava", () => {
    // 2026-09-10T21:30 em Brasília = 2026-09-11T00:30Z.
    em("2026-09-11T00:30:00.000Z");
    expect(hojeNaLoja()).toBe("2026-09-10");
    // O dia começou às 00:00 de Brasília, que é 03:00Z do dia 10.
    expect(todayStartISO()).toBe("2026-09-10T03:00:00.000Z");
  });

  it("a venda das 21h30 cai DENTRO do período 'hoje'", () => {
    em("2026-09-11T00:30:00.000Z");
    const venda = new Date("2026-09-11T00:30:00.000Z");
    const { from, to } = rangeForPeriod("today");
    expect(new Date(from) <= venda).toBe(true);
    expect(venda <= new Date(to)).toBe(true);
    // E o fim do dia é 02:59:59.999Z do dia seguinte.
    expect(to).toBe("2026-09-11T02:59:59.999Z");
  });

  it("à meia-noite e um minuto de Brasília já é o dia novo", () => {
    // 2026-09-11T00:01 em Brasília = 2026-09-11T03:01Z.
    em("2026-09-11T03:01:00.000Z");
    expect(hojeNaLoja()).toBe("2026-09-11");
    expect(todayStartISO()).toBe("2026-09-11T03:00:00.000Z");
  });

  it("o mês começa à meia-noite de Brasília do dia 1º", () => {
    // 2026-08-31T23h de Brasília: ainda é agosto, mesmo já sendo setembro em UTC.
    em("2026-09-01T02:00:00.000Z");
    expect(hojeNaLoja()).toBe("2026-08-31");
    expect(monthStartISO()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("o período de 7 dias conta 7 dias do calendário da loja", () => {
    em("2026-09-11T00:30:00.000Z"); // 10/09, 21h30 em Brasília
    const { from, to } = rangeForPeriod("7d");
    expect(from).toBe("2026-09-04T03:00:00.000Z");
    expect(to).toBe("2026-09-11T02:59:59.999Z");
  });

  it("data digitada no filtro vira o dia inteiro da loja", () => {
    expect(dayStartISO("2026-09-10")).toBe("2026-09-10T03:00:00.000Z");
    expect(dayEndISO("2026-09-10")).toBe("2026-09-11T02:59:59.999Z");
  });

  it("parâmetro inventado na URL não vira filtro silencioso", () => {
    expect(dayStartISO("10/09/2026")).toBeNull();
    expect(dayEndISO("ontem")).toBeNull();
  });

  it("intervalo personalizado cobre do começo ao fim, na loja", () => {
    const { from, to } = rangeForPeriod("custom", "2026-09-01", "2026-09-10");
    expect(from).toBe("2026-09-01T03:00:00.000Z");
    expect(to).toBe("2026-09-11T02:59:59.999Z");
  });

  it("um instante vira a data pura do dia da LOJA", () => {
    // 23h30 de Brasília do dia 10 = 02:30Z do dia 11.
    expect(toDateInputValue("2026-09-11T02:30:00.000Z")).toBe("2026-09-10");
  });

  it("data e hora aparecem no relógio de Brasília, não no do servidor", () => {
    expect(formatDate("2026-09-11T02:30:00.000Z")).toBe("10/09/2026");
    expect(formatDateTime("2026-09-11T02:30:00.000Z")).toContain("10/09/2026");
    expect(formatDateTime("2026-09-11T02:30:00.000Z")).toContain("23:30");
  });
});
