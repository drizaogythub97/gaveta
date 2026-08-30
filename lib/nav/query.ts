/**
 * Montagem de URL de filtro — a base do padrão de filtragem do sistema.
 *
 * Regra que vale para todas as telas: **a URL é a fonte da verdade do
 * filtro**. Quem filtra reescreve a query e navega; o servidor lê os
 * parâmetros e devolve os dados. Isso mantém link compartilhável, botão
 * voltar e recarregar funcionando, sem duplicar estado no cliente.
 *
 * O que NÃO pode acontecer é o filtro montar a query do zero: foi assim que
 * o intervalo personalizado do Financeiro derrubava a aba escolhida — um
 * `<form method="get">` só envia os próprios campos, e tudo o que não
 * estava no formulário (`tab`, `sort`) sumia da URL.
 */

export type QueryOverrides = Record<string, string | null | undefined>;

/**
 * Aplica alterações sobre a query ATUAL, preservando o resto.
 *
 * `null` remove a chave (é assim que se zera a paginação ao filtrar);
 * `undefined` é ignorado, para dar para montar overrides condicionais.
 */
export function buildQuery(
  base: URLSearchParams | string,
  overrides: QueryOverrides = {},
): string {
  const next = new URLSearchParams(
    typeof base === "string" ? base : base.toString(),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "?";
}
