import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme/theme";

export {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  parseTheme,
  type Theme,
} from "@/lib/theme/theme";

export async function getThemeFromCookie(): Promise<Theme | null> {
  const store = await cookies();
  return parseTheme(store.get(THEME_COOKIE)?.value);
}

/**
 * O tema é escolha da CONTA, não do aparelho (diferente do modo
 * Simples/Minimalista, que é por aparelho de propósito).
 *
 * O cookie existe só para o script anti-flash decidir antes da hidratação —
 * ele é um cache. Num aparelho novo o cookie não existe, e ler apenas ele
 * devolvia "claro" para quem tinha escolhido "escuro": a chave em
 * Preferências (que lê o banco) aparecia certa e a tela vinha branca.
 *
 * Por isso a fonte da verdade é `profiles.theme`, consultado só quando o
 * cookie falta. O layout devolve o tema resolvido ao navegador, que grava o
 * cookie — da segunda visita em diante não há consulta nenhuma.
 */
export async function resolveTheme(): Promise<{
  theme: Theme;
  fromCookie: boolean;
}> {
  const cookieTheme = await getThemeFromCookie();
  if (cookieTheme) return { theme: cookieTheme, fromCookie: true };

  const theme = (await readThemeFromProfile()) ?? "light";
  return { theme, fromCookie: false };
}

/** Tema gravado no perfil do usuário logado. `null` sem sessão ou sem perfil. */
export async function readThemeFromProfile(): Promise<Theme | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("theme")
    .eq("id", user.id)
    .maybeSingle();

  return parseTheme((data?.theme as string | undefined) ?? null);
}
