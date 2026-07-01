"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (necessário para o app ser "instalável" no
 * celular). Sem UI — apenas roda o efeito uma vez no cliente. Falhas são
 * silenciosas (a app funciona igual sem o SW; ele só habilita a instalação).
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignorado de propósito: instalação da PWA é progressive enhancement.
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
