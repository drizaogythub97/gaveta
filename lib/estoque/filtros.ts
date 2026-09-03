/**
 * Leitura dos filtros do Estoque a partir da URL.
 *
 * O Estoque filtrava no navegador, sobre o catálogo inteiro carregado de uma
 * vez; Produtos já filtrava no banco. Duas telas parecidas com comportamentos
 * diferentes — e a do navegador não tinha paginação, então o celular
 * recebia todos os itens controlados por estoque a cada visita. Agora as duas
 * seguem o mesmo contrato: **o recorte vive na query string** e quem filtra
 * navega por transição (`useFiltroNav`).
 *
 * Este módulo é só a leitura: puro, sem Supabase e sem React, para o
 * tratamento de parâmetro inventado na URL poder ser testado direto.
 */

/** Itens por página da listagem do Estoque — o mesmo de Produtos. */
export const ESTOQUE_PAGE_SIZE = 15;

export type ParamsBrutos = Record<string, string | string[] | undefined>;

export type FiltrosEstoque = {
  /** Termo de busca por nome OU código de barras, já sem espaços nas pontas. */
  termo: string;
  /** Data inicial de cadastro, `AAAA-MM-DD`, ou "" quando não há filtro. */
  de: string;
  /** Data final de cadastro, `AAAA-MM-DD`, ou "". */
  ate: string;
  /** Texto do campo de quantidade mínima, como a pessoa digitou. */
  minTexto: string;
  /** Texto do campo de quantidade máxima. */
  maxTexto: string;
  /** Quantidade mínima já convertida, ou `null` quando o campo não filtra. */
  min: number | null;
  /** Quantidade máxima já convertida, ou `null`. */
  max: number | null;
  /** Só itens com estoque baixo. */
  soBaixo: boolean;
  /** Página pedida, sempre ≥ 1. */
  pagina: number;
};

export function pickString(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Data só entra no filtro se vier exatamente como `AAAA-MM-DD`. */
function lerData(value: string | string[] | undefined): string {
  const bruto = (pickString(value) ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : "";
}

/**
 * Quantidade digitada → número.
 *
 * Aceita vírgula decimal (é como se escreve em português) e devolve `null`
 * quando o campo está vazio, não é número ou é negativo — nesses casos o
 * filtro simplesmente não se aplica, em vez de esvaziar a lista sem
 * explicação. O texto original volta junto para o campo continuar mostrando
 * o que foi digitado.
 */
function lerQuantidade(value: string | string[] | undefined): {
  texto: string;
  numero: number | null;
} {
  const texto = (pickString(value) ?? "").trim();
  if (texto === "") return { texto: "", numero: null };
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return { texto, numero: null };
  return { texto, numero: n };
}

function lerPagina(value: string | string[] | undefined): number {
  const n = Number.parseInt(pickString(value) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function lerFiltrosEstoque(params: ParamsBrutos): FiltrosEstoque {
  const min = lerQuantidade(params.min);
  const max = lerQuantidade(params.max);
  return {
    termo: (pickString(params.q) ?? "").trim(),
    de: lerData(params.from),
    ate: lerData(params.to),
    minTexto: min.texto,
    maxTexto: max.texto,
    min: min.numero,
    max: max.numero,
    soBaixo: pickString(params.low) === "1",
    pagina: lerPagina(params.page),
  };
}

/** Se algum recorte está ativo — muda a mensagem da lista vazia. */
export function temFiltroEstoque(f: FiltrosEstoque): boolean {
  return (
    f.termo !== "" ||
    f.de !== "" ||
    f.ate !== "" ||
    f.minTexto !== "" ||
    f.maxTexto !== "" ||
    f.soBaixo
  );
}
