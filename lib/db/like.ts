/**
 * Escapa o que o LIKE/ILIKE trata como curinga.
 *
 * `%` e `_` são curingas do padrão SQL: sem escapar, quem busca "50%"
 * estaria pedindo "qualquer coisa" sem saber, e a consulta devolveria a
 * tabela inteira. O `\` é o caractere de escape padrão do Postgres, então
 * ele próprio também precisa ser dobrado.
 *
 * Vale para busca por texto e para comparação de nome sem diferenciar caixa
 * (`ilike` com o termo exato).
 */
export function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Prepara um valor para dentro de um filtro `or(...)` do PostgREST.
 *
 * A gramática do `or` separa as condições por **vírgula** e delimita listas
 * com **parênteses**. Um termo de busca que contenha um desses caracteres
 * quebraria a consulta inteira — e, pior, um termo escolhido de propósito
 * poderia acrescentar condição. Entre aspas duplas o valor é lido literal;
 * só as próprias aspas e a barra invertida precisam de escape.
 *
 * Usar sempre em cima do valor JÁ escapado por {@link escaparLike} quando o
 * operador for `like`/`ilike` — são coisas diferentes: um protege o curinga
 * do SQL, o outro protege a sintaxe da query string.
 */
export function valorParaOr(valor: string): string {
  return `"${valor.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}
