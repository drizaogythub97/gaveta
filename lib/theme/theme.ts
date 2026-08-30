/**
 * Constantes do tema — sem nada de servidor, para poder ser importado
 * também por Client Components (`lib/theme/cookie.ts` lê banco e cookies e
 * não atravessa essa fronteira).
 */

export const THEME_COOKIE = "erp_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}
