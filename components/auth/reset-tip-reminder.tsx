"use client";

import { useEffect } from "react";

import { TIP_LATER_KEY } from "@/lib/personalization-tip";

/**
 * Ao chegar na tela de login, limpa o "lembrar mais tarde" da sessão para que
 * o aviso de personalização volte a aparecer no próximo login (sem afetar quem
 * escolheu "Não mostrar novamente", que é permanente).
 */
export function ResetTipReminder() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(TIP_LATER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}
