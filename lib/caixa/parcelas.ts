/**
 * Quantas parcelas o crédito parcelado aceita — UMA verdade só.
 *
 * Havia três, e elas discordavam: a tela oferecia 2 a 12, a Server Action
 * aceitava 2 a 24 e a `register_sale` aceitava 1 a 24. Ninguém tropeçava
 * porque a tela era a única porta — mas a próxima porta (importação,
 * integração) escolheria a errada. Ver o achado F de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 *
 * O banco valida o mesmo intervalo (migration 0023). São dois lugares porque
 * o banco não lê TypeScript — mas são os dois únicos, e o SQL aponta para
 * este arquivo.
 */
export const PARCELAS_MIN = 2;
export const PARCELAS_MAX = 12;

/** As opções que a tela oferece, na ordem. */
export const PARCELAS_OPCOES: readonly number[] = Array.from(
  { length: PARCELAS_MAX - PARCELAS_MIN + 1 },
  (_, i) => PARCELAS_MIN + i,
);

/** O número de parcelas serve? Vale para a tela e para o servidor. */
export function parcelasValidas(n: number | null | undefined): boolean {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= PARCELAS_MIN &&
    n <= PARCELAS_MAX
  );
}
