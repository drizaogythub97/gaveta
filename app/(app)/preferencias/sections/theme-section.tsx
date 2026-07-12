"use client";

import { Moon, Sun } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/theme/cookie";

import { saveTheme } from "../actions";

type Props = { currentTheme: Theme };

export function ThemeSection({ currentTheme }: Props) {
  const [pending, startTransition] = useTransition();

  function handleSelect(theme: Theme) {
    if (theme === currentTheme) return;
    startTransition(async () => {
      // Aplica imediato no cliente (UX) e dispara persistência no servidor.
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
      }
      await saveTheme(theme);
    });
  }

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Claro", Icon: Sun },
    { value: "dark", label: "Escuro", Icon: Moon },
  ];

  return (
    <section
      aria-labelledby="theme-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1"
    >
      <header>
        <h2 id="theme-heading" className="minimal:max-sm:text-lg text-xl font-semibold">
          Tema
        </h2>
        <p className="text-muted-foreground text-base">
          Escolha entre fundo claro (padrão) ou escuro para reduzir o brilho da
          tela.
        </p>
      </header>
      <div
        role="radiogroup"
        aria-label="Tema da interface"
        className="grid grid-cols-2 gap-3 sm:max-w-md"
      >
        {options.map(({ value, label, Icon }) => {
          const active = currentTheme === value;
          return (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => handleSelect(value)}
              variant={active ? "default" : "outline"}
              className="h-14 gap-2 text-base"
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
