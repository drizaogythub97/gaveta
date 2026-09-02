import { describe, expect, it } from "vitest";

import { buildQuery } from "@/lib/nav/query";

/**
 * A montagem da URL de filtro é a peça que sustenta a regra "filtro é sempre
 * URL + transição". O que se garante aqui é justamente o que já quebrou uma
 * vez em produção: o filtro NÃO pode montar a query do zero — foi assim que
 * o intervalo personalizado do Financeiro derrubava a aba aberta.
 */
describe("buildQuery", () => {
  it("preserva os parâmetros que o filtro não mencionou", () => {
    const url = buildQuery("tab=vendas&sort=data", { page: "2" });
    const params = new URLSearchParams(url.slice(1));
    expect(params.get("tab")).toBe("vendas");
    expect(params.get("sort")).toBe("data");
    expect(params.get("page")).toBe("2");
  });

  it("remove a chave com null e ignora undefined", () => {
    const url = buildQuery("tab=vendas&page=3", {
      page: null,
      sort: undefined,
    });
    const params = new URLSearchParams(url.slice(1));
    expect(params.get("tab")).toBe("vendas");
    expect(params.has("page")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it("grava a chave repetida quando o valor é uma lista", () => {
    const url = buildQuery("tab=vendas", { tag: ["a", "b"] });
    const params = new URLSearchParams(url.slice(1));
    expect(params.getAll("tag")).toEqual(["a", "b"]);
    expect(params.get("tab")).toBe("vendas");
  });

  it("substitui a lista inteira, sem acumular com a anterior", () => {
    const url = buildQuery("tag=a&tag=b", { tag: ["c"] });
    expect(new URLSearchParams(url.slice(1)).getAll("tag")).toEqual(["c"]);
  });

  it("lista vazia equivale a remover a chave", () => {
    const url = buildQuery("tag=a&tag=b&page=2", { tag: [] });
    const params = new URLSearchParams(url.slice(1));
    expect(params.getAll("tag")).toEqual([]);
    expect(params.get("page")).toBe("2");
  });

  it("devolve '?' quando não sobra nada", () => {
    expect(buildQuery("tag=a", { tag: null })).toBe("?");
  });
});
