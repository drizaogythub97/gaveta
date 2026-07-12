"use client";

import { useState, useSyncExternalStore } from "react";

// Mesmo valor de lib/ui-mode/cookie.ts — que não pode ser importado aqui
// (puxa next/headers). Mesmo padrão do cookie de tema.
type UiMode = "simples" | "minimalista";
const UI_MODE_COOKIE = "gaveta_ui_mode";

/**
 * Tela de escolha do modo de exibição do celular. Aparece UMA vez por
 * aparelho: na primeira visita em viewport mobile sem o cookie
 * `gaveta_ui_mode` (o servidor só renderiza este componente quando o cookie
 * não existe; aqui conferimos o viewport). A escolha vale só para o celular —
 * o desktop nunca muda — e pode ser trocada em Configurações → Preferências.
 */
const MOBILE_QUERY = "(max-width: 639px)"; // mesmo corte do breakpoint `sm`

function subscribeMobile(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function ModoChooser() {
  // useSyncExternalStore: no servidor é false, então o overlay nunca entra
  // no HTML — só aparece em viewport mobile.
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const [escolhido, setEscolhido] = useState(false);

  function escolher(modo: UiMode) {
    document.cookie = `${UI_MODE_COOKIE}=${modo}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.setAttribute("data-ui-mode", modo);
    setEscolhido(true);
  }

  if (!isMobile || escolhido) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modo-chooser-titulo"
      className="bg-background fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1
            id="modo-chooser-titulo"
            className="text-2xl font-bold tracking-tight"
          >
            Como você prefere usar o Gaveta no celular?
          </h1>
          <p className="text-muted-foreground text-base">
            Toque em uma opção para escolher o visual.
          </p>
        </header>

        <button
          type="button"
          onClick={() => escolher("simples")}
          className="ring-foreground/15 bg-card hover:ring-primary focus-visible:ring-primary flex items-start gap-4 rounded-2xl p-5 text-left ring-1 transition-shadow focus-visible:ring-2 focus-visible:outline-none"
        >
          <PreviewSimples />
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-lg font-semibold">Simples</span>
            <span className="text-muted-foreground text-base">
              Botões e letras grandes, menu sempre visível no topo. Tudo à mão,
              sem esconder nada.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => escolher("minimalista")}
          className="ring-foreground/15 bg-card hover:ring-primary focus-visible:ring-primary flex items-start gap-4 rounded-2xl p-5 text-left ring-1 transition-shadow focus-visible:ring-2 focus-visible:outline-none"
        >
          <PreviewMinimalista />
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-lg font-semibold">Minimalista</span>
            <span className="text-muted-foreground text-base">
              Visual moderno e compacto. Navegação pela barra inferior e mais
              informação na tela.
            </span>
          </span>
        </button>

        <p className="text-muted-foreground text-center text-sm">
          Você pode trocar quando quiser em Configurações → Preferências.
        </p>
      </div>
    </div>
  );
}

/* Miniaturas esquemáticas dos dois layouts (decorativas). */

function PreviewSimples() {
  return (
    <span
      aria-hidden="true"
      className="border-border bg-background flex h-24 w-14 shrink-0 flex-col gap-1 rounded-lg border p-1.5"
    >
      <span className="bg-muted h-1.5 rounded-sm" />
      <span className="grid grid-cols-2 gap-1">
        <span className="bg-primary/60 h-2 rounded-sm" />
        <span className="bg-muted h-2 rounded-sm" />
        <span className="bg-muted h-2 rounded-sm" />
        <span className="bg-muted h-2 rounded-sm" />
      </span>
      <span className="bg-muted mt-1 h-3 rounded-sm" />
      <span className="bg-muted h-3 rounded-sm" />
      <span className="bg-muted h-3 rounded-sm" />
    </span>
  );
}

function PreviewMinimalista() {
  return (
    <span
      aria-hidden="true"
      className="border-border bg-background flex h-24 w-14 shrink-0 flex-col gap-1 rounded-lg border p-1.5"
    >
      <span className="bg-muted h-1.5 rounded-sm" />
      <span className="grid grid-cols-2 gap-1">
        <span className="bg-muted h-4 rounded-sm" />
        <span className="bg-muted h-4 rounded-sm" />
      </span>
      <span className="bg-muted h-2.5 rounded-sm" />
      <span className="bg-muted h-2.5 rounded-sm" />
      <span className="mt-auto flex justify-between px-0.5">
        <span className="bg-primary/60 size-1.5 rounded-full" />
        <span className="bg-muted size-1.5 rounded-full" />
        <span className="bg-muted size-1.5 rounded-full" />
        <span className="bg-muted size-1.5 rounded-full" />
        <span className="bg-muted size-1.5 rounded-full" />
      </span>
    </span>
  );
}
