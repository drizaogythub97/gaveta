"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster do app. Posição fixa no canto superior direito (requisito de UX).
 * As cores vêm dos tokens (`bg-card`, `border-border`...), que já acompanham a
 * classe `.dark` no <html> — por isso não precisamos detectar o tema aqui.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            "bg-card text-card-foreground border border-border rounded-xl shadow-lg",
        },
      }}
    />
  );
}
