import { describe, expect, it } from "vitest";

import { escaparLike, valorParaOr } from "@/lib/db/like";
import { lerFiltrosEstoque, temFiltroEstoque } from "@/lib/estoque/filtros";

/**
 * Os filtros do Estoque passaram do navegador para o banco. O que se guarda
 * aqui é a fronteira: o que a URL manda vira consulta, e a URL é pública —
 * qualquer pessoa pode digitar o que quiser nela.
 */
describe("lerFiltrosEstoque", () => {
  it("lê o recorte completo da query string", () => {
    const f = lerFiltrosEstoque({
      q: " refri ",
      from: "2026-01-01",
      to: "2026-02-28",
      min: "2",
      max: "10,5",
      low: "1",
      page: "3",
    });
    expect(f).toMatchObject({
      termo: "refri",
      de: "2026-01-01",
      ate: "2026-02-28",
      min: 2,
      max: 10.5,
      soBaixo: true,
      pagina: 3,
    });
  });

  it("devolve o recorte vazio quando não há parâmetro nenhum", () => {
    const f = lerFiltrosEstoque({});
    expect(temFiltroEstoque(f)).toBe(false);
    expect(f).toMatchObject({ termo: "", min: null, max: null, pagina: 1 });
  });

  // Parâmetro inventado não pode virar filtro: o pedido é ignorado e a lista
  // sai inteira, em vez de vazia sem explicação.
  it("descarta data fora do formato AAAA-MM-DD", () => {
    const f = lerFiltrosEstoque({ from: "01/01/2026", to: "ontem" });
    expect(f.de).toBe("");
    expect(f.ate).toBe("");
    expect(temFiltroEstoque(f)).toBe(false);
  });

  it("descarta quantidade que não é número ou é negativa, mas mantém o texto", () => {
    const f = lerFiltrosEstoque({ min: "abc", max: "-4" });
    expect(f.min).toBeNull();
    expect(f.max).toBeNull();
    // O campo continua mostrando o que a pessoa digitou...
    expect(f.minTexto).toBe("abc");
    // ...e a tela sabe que há filtro na URL, para oferecer o "limpar".
    expect(temFiltroEstoque(f)).toBe(true);
  });

  it("aceita vírgula como separador decimal", () => {
    expect(lerFiltrosEstoque({ min: "1,25" }).min).toBe(1.25);
  });

  it("cai na primeira página com page inválido", () => {
    expect(lerFiltrosEstoque({ page: "0" }).pagina).toBe(1);
    expect(lerFiltrosEstoque({ page: "-2" }).pagina).toBe(1);
    expect(lerFiltrosEstoque({ page: "abc" }).pagina).toBe(1);
  });

  it("só liga o estoque baixo com low=1", () => {
    expect(lerFiltrosEstoque({ low: "1" }).soBaixo).toBe(true);
    expect(lerFiltrosEstoque({ low: "true" }).soBaixo).toBe(false);
    expect(lerFiltrosEstoque({}).soBaixo).toBe(false);
  });

  it("usa o primeiro valor quando o parâmetro vem repetido", () => {
    expect(lerFiltrosEstoque({ q: ["um", "dois"] }).termo).toBe("um");
  });
});

/**
 * A busca por nome OU código monta um `or(...)` do PostgREST. A gramática
 * desse filtro separa condições por vírgula e delimita listas por
 * parênteses: sem as aspas, um termo com esses caracteres quebraria a
 * consulta — ou acrescentaria condição.
 */
describe("valorParaOr", () => {
  it("envolve o valor em aspas duplas", () => {
    expect(valorParaOr("%refri%")).toBe('"%refri%"');
  });

  it("mantém dentro das aspas o que separaria condições", () => {
    expect(valorParaOr("%a,b%")).toBe('"%a,b%"');
    expect(valorParaOr("%(x)%")).toBe('"%(x)%"');
  });

  it("escapa aspas e barra invertida do próprio termo", () => {
    expect(valorParaOr('a"b')).toBe('"a\\"b"');
    expect(valorParaOr("a\\b")).toBe('"a\\\\b"');
  });

  it("compõe com escaparLike sem desfazer o escape do curinga", () => {
    // Quem busca "50%" quer o texto, não "qualquer coisa".
    expect(valorParaOr(`%${escaparLike("50%")}%`)).toBe('"%50\\\\%%"');
  });
});
