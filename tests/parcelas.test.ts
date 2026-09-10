import { describe, expect, it } from "vitest";

import {
  PARCELAS_MAX,
  PARCELAS_MIN,
  PARCELAS_OPCOES,
  parcelasValidas,
} from "@/lib/caixa/parcelas";

/**
 * Um limite só para o número de parcelas.
 *
 * Havia três, e eles discordavam: tela 2–12, Server Action 2–24, banco
 * 1–24. Ninguém tropeçava porque a tela era a única porta — o defeito era
 * esperar a próxima porta. Ver o achado F de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 */
describe("parcelas", () => {
  it("a tela oferece exatamente o intervalo que o servidor aceita", () => {
    expect(PARCELAS_OPCOES[0]).toBe(PARCELAS_MIN);
    expect(PARCELAS_OPCOES.at(-1)).toBe(PARCELAS_MAX);
    for (const n of PARCELAS_OPCOES) {
      expect(parcelasValidas(n)).toBe(true);
    }
  });

  it("recusa o que ficou de fora — inclusive o 24 que a action aceitava", () => {
    expect(parcelasValidas(1)).toBe(false);
    expect(parcelasValidas(13)).toBe(false);
    expect(parcelasValidas(24)).toBe(false);
    expect(parcelasValidas(0)).toBe(false);
    expect(parcelasValidas(-2)).toBe(false);
  });

  it("recusa o que nem é número inteiro", () => {
    expect(parcelasValidas(null)).toBe(false);
    expect(parcelasValidas(undefined)).toBe(false);
    expect(parcelasValidas(2.5)).toBe(false);
    expect(parcelasValidas(Number.NaN)).toBe(false);
  });

  it("não tem buraco no meio da lista", () => {
    expect(PARCELAS_OPCOES).toHaveLength(PARCELAS_MAX - PARCELAS_MIN + 1);
    expect([...PARCELAS_OPCOES]).toEqual(
      [...PARCELAS_OPCOES].sort((a, b) => a - b),
    );
  });
});
