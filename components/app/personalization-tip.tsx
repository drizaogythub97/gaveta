"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TIP_DISMISSED_KEY, TIP_LATER_KEY } from "@/lib/personalization-tip";

const TOAST_ID = "personalization-tip";

type Props = {
  /** true quando o usuário já definiu nome OU logo da loja. */
  isPersonalized: boolean;
};

/**
 * Aviso persistente (canto superior direito) sugerindo personalizar o nome e a
 * logo da loja. Fica na tela até o usuário escolher uma ação:
 * - "Personalizar agora" → vai para Preferências;
 * - "Lembrar mais tarde" → some nesta sessão, volta no próximo login;
 * - "Não mostrar novamente" → não aparece mais (por dispositivo).
 * Não aparece quando o usuário já personalizou nome ou logo.
 */
export function PersonalizationTip({ isPersonalized }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (isPersonalized) return;
    try {
      if (localStorage.getItem(TIP_DISMISSED_KEY) === "1") return;
      if (sessionStorage.getItem(TIP_LATER_KEY) === "1") return;
    } catch {
      // Armazenamento indisponível: mostra o aviso mesmo assim.
    }

    toast.custom(
      (id) => (
        <div className="border-border bg-card text-card-foreground flex w-[min(92vw,22rem)] flex-col gap-3 rounded-xl border p-4 shadow-lg">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">Deixe o Gaveta com a sua cara</p>
            <p className="text-muted-foreground text-sm">
              Personalize o nome e a logo da sua loja em Preferências — eles
              aparecem no topo do sistema.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 w-full text-base"
              onClick={() => {
                toast.dismiss(id);
                router.push("/preferencias");
              }}
            >
              Personalizar agora
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 text-sm"
                onClick={() => {
                  try {
                    sessionStorage.setItem(TIP_LATER_KEY, "1");
                  } catch {
                    /* ignore */
                  }
                  toast.dismiss(id);
                }}
              >
                Lembrar mais tarde
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground h-11 flex-1 text-sm"
                onClick={() => {
                  try {
                    localStorage.setItem(TIP_DISMISSED_KEY, "1");
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
        </div>
      ),
      { id: TOAST_ID, duration: Infinity },
    );

    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [isPersonalized, router]);

  return null;
}
