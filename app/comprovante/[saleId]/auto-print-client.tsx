"use client";

import { Printer, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import styles from "./print-page.module.css";

export function PrintToolbar() {
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
