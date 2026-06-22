"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CAIXA_TIP_DISMISSED_KEY, CAIXA_TIP_SEEN_KEY } from "@/lib/caixa-tip";

const TOAST_ID = "caixa-fullscreen-tip";

/**
 * Aviso (canto superior direito) que apresenta o modo tela cheia da frente de
 * caixa. Fica até o usuário escolher uma ação:
 * - "Entendi" → some nesta sessão (volta numa próxima);
 * - "Não mostrar novamente" → não aparece mais (por dispositivo).
 */
export function CaixaFullscreenTip() {
  useEffect(() => {
    try {
      if (localStorage.getItem(CAIXA_TIP_DISMISSED_KEY) === "1") return;
      if (sessionStorage.getItem(CAIXA_TIP_SEEN_KEY) === "1") return;
    } catch {
      // Armazenamento indisponível: mostra mesmo assim.
    }

    toast.custom(
      (id) => (
        <div className="border-border bg-card text-card-foreground flex w-[min(92vw,22rem)] flex-col gap-3 rounded-xl border p-4 shadow-lg">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">Modo tela cheia disponível</p>
            <p className="text-muted-foreground text-sm">
              Toque em <strong>&ldquo;Tela cheia&rdquo;</strong> (ou aperte{" "}
              <strong>Alt + Shift + F</strong>) para focar só nas vendas — ótimo
              no balcão. O leitor de código continua funcionando.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1 text-sm"
              onClick={() => {
                try {
                  sessionStorage.setItem(CAIXA_TIP_SEEN_KEY, "1");
                } catch {
                  /* ignore */
                }
                toast.dismiss(id);
              }}
            >
              Entendi
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground h-11 flex-1 text-sm"
              onClick={() => {
                try {
                  localStorage.setItem(CAIXA_TIP_DISMISSED_KEY, "1");
                } catch {
                  /* ignore */
                }
                toast.dismiss(id);
              }}
            >
              Não mostrar novamente
            </Button>
          </div>
        </div>
      ),
      { id: TOAST_ID, duration: Infinity },
    );

    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, []);

  return null;
}
