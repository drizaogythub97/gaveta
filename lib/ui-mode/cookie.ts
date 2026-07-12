import { cookies } from "next/headers";

export const UI_MODE_COOKIE = "gaveta_ui_mode";
export type UiMode = "simples" | "minimalista";

// Modo de exibição do CELULAR (viewport < sm). Escolha por aparelho, como o
// tema. `null` = nunca escolheu — o app mostra a tela de escolha na primeira
// entrada em viewport mobile (ver ModoChooser). O padrão efetivo é "simples"
// (layout atual), então o desktop e quem nunca escolheu não mudam em nada.
export async function getUiModeFromCookie(): Promise<UiMode | null> {
  const store = await cookies();
  const value = store.get(UI_MODE_COOKIE)?.value;
  return value === "minimalista" || value === "simples" ? value : null;
}
