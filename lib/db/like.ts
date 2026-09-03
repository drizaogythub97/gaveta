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
