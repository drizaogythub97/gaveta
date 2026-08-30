"use client";

import { useEffect } from "react";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type Theme,
} from "@/lib/theme/theme";

/**
 * Aplica no `<html>` o tema que o servidor conhece para esta conta.
 *
 * Por que não basta o layout raiz: o `<html>` só é renderizado no
 * carregamento do documento. Depois do login, o Next vai para o painel por
 * navegação de cliente — o layout da área autenticada é remontado, o `<html>`
 * não. Sem isto, quem entra em aparelho novo continuaria vendo o tema do
 * documento anterior (a tela de login, sempre clara) até recarregar na mão.
 *
 * Também acerta o cookie, que é o cache lido pelo script anti-flash.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const atual = document.cookie.match(
      new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`),
    )?.[1];
    if (atual !== theme) {
      document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
    }
  }, [theme]);

  return null;
}
