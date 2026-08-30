"use client";

import Link from "next/link";

import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";
import { cn } from "@/lib/utils";

import { TAB_LABELS, TABS, type Tab } from "./tabs";

/**
 * Abas do Financeiro.
 *
 * São `<Link>` de verdade (abrir em outra aba, copiar endereço e o botão
 * voltar continuam funcionando), mas o clique comum passa pela mesma
 * transição dos filtros: troca só o conteúdo da aba, sem o carregador de
 * tela cheia e sem pular para o topo.
 */
export function TabNav({ current }: { current: Tab }) {
  const { pendente, href, aplicar } = useFiltroNav();

  return (
    <nav
      aria-label="Seções do financeiro"
      aria-busy={pendente}
      className="flex flex-wrap gap-2"
    >
      {TABS.map((t) => {
        const active = t === current;
        return (
          <Link
            key={t}
            // A troca de aba zera a paginação: a página 3 de Vendas não quer
            // dizer nada nas Despesas.
            href={href({ tab: t, page: null })}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              aplicar({ tab: t, page: null });
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-12 items-center rounded-lg px-5 text-base font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </Link>
        );
      })}
    </nav>
  );
}
