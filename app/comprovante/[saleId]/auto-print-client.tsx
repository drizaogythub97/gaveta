"use client";

import { Printer, Share2, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useClientFlag } from "@/lib/hooks/use-client-flag";

import styles from "./print-page.module.css";

export function PrintToolbar({
  shareTitle,
  shareText,
}: {
  shareTitle: string;
  shareText: string;
}) {
  const canShare = useClientFlag(
    () => typeof navigator !== "undefined" && "share" in navigator,
  );

  function handleShare() {
    navigator.share?.({ title: shareTitle, text: shareText }).catch(() => {
      // Usuário cancelou ou compartilhamento indisponível: silencioso.
    });
  }

  // Dispara o diálogo de impressão automaticamente ao abrir, dando um
  // instante para fontes e a logo carregarem (senão saem em branco).
  useEffect(() => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const trigger = () => {
      if (done) return;
      done = true;
      window.print();
    };
    const schedule = () => {
      timer = setTimeout(trigger, 400);
    };
    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", schedule);
    };
  }, []);

  function handleClose() {
    // Aberto em nova aba pelo caixa → fecha; caso contrário, volta.
    if (window.opener) {
      window.close();
    } else {
      window.history.back();
    }
  }

  return (
    <div className={styles.toolbar}>
      <Button
        type="button"
        onClick={() => window.print()}
        className="h-14 gap-2 px-6 text-lg"
      >
        <Printer aria-hidden="true" className="size-5" />
        Imprimir
      </Button>
      {canShare ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleShare}
          className="h-14 gap-2 px-6 text-lg"
        >
          <Share2 aria-hidden="true" className="size-5" />
          Compartilhar
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={handleClose}
        className="h-14 gap-2 px-6 text-lg"
      >
        <X aria-hidden="true" className="size-5" />
        Fechar
      </Button>
    </div>
  );
}
