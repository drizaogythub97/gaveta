"use client";

import { LayoutGrid, Smartphone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// Mesmo valor de lib/ui-mode/cookie.ts (não importável aqui: next/headers).
type UiMode = "simples" | "minimalista";
const UI_MODE_COOKIE = "gaveta_ui_mode";

type Props = {
  /** null = nunca escolheu (o padrão efetivo é "simples"). */
  initialMode: UiMode | null;
};

// Fora do componente: a regra react-hooks/immutability barra atribuição a
// globais (document.cookie) dentro dele.
function aplicarModo(novo: UiMode) {
  document.cookie = `${UI_MODE_COOKIE}=${novo}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("data-ui-mode", novo);
}

/**
 * Modo de exibição do CELULAR. Escolha por aparelho (cookie, como o tema em
 * outros apps): o atributo aplica na hora (variant `minimal` do CSS) e o
 * cookie mantém no SSR das próximas navegações. Não persiste no perfil de
 * propósito — cada aparelho do usuário pode ter seu modo.
 */
export function UiModeSection({ initialMode }: Props) {
  const [mode, setMode] = useState<UiMode>(initialMode ?? "simples");

  function handleSelect(novo: UiMode) {
    setMode(novo);
    aplicarModo(novo);
  }

  const options: { value: UiMode; label: string; Icon: typeof Smartphone }[] = [
    { value: "simples", label: "Simples", Icon: LayoutGrid },
    { value: "minimalista", label: "Minimalista", Icon: Smartphone },
  ];

  return (
    <section
      aria-labelledby="ui-mode-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
    >
      <header className="minimal:max-sm:border-b minimal:max-sm:border-border/60 minimal:max-sm:pb-3">
        <h2
          id="ui-mode-heading"
          className="minimal:max-sm:text-base text-xl font-semibold"
        >
          Modo de exibição no celular
        </h2>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-base">
          Vale só neste aparelho e não muda nada no computador. Simples: botões
          grandes e menu sempre visível. Minimalista: visual compacto com barra
          de navegação embaixo.
        </p>
      </header>
      <div
        role="radiogroup"
        aria-label="Modo de exibição no celular"
        className="grid grid-cols-2 gap-3 sm:max-w-md"
      >
        {options.map(({ value, label, Icon }) => {
          const active = mode === value;
          return (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(value)}
              variant={active ? "default" : "outline"}
              className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 gap-2 text-base"
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
