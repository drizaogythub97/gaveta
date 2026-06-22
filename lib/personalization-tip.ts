/**
 * Chaves de armazenamento (não sensível) do aviso de personalização.
 * - DISMISSED (localStorage): usuário clicou "Não mostrar novamente" — permanente.
 * - LATER (sessionStorage): "Lembrar mais tarde" — volta a aparecer no próximo login.
 */
export const TIP_DISMISSED_KEY = "gaveta:personalization-tip:dismissed";
export const TIP_LATER_KEY = "gaveta:personalization-tip:later";
