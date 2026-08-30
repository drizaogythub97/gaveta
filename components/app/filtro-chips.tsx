"use client";

import Link from "next/link";

import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";
import { cn } from "@/lib/utils";

export type OpcaoFiltro = { value: string; label: string };

/**
 * Fileira de chips que filtra por um parâmetro da URL.
 *
 * É o formato padrão de filtro simples do sistema: continua sendo `<Link>`
 * (endereço copiável, botão voltar, abrir em outra aba), mas o clique comum
 * aplica o filtro por transição — o resto da tela permanece, sem o
 * carregador de tela cheia e sem pular para o topo.
 */
export function FiltroChips({
  param,
  opcoes,
  atual,
  rotulo,
  valorPadrao,
}: {
  /** Nome do parâmetro na URL (ex.: "type", "tag"). */
  param: string;
  opcoes: OpcaoFiltro[];
  atual: string;
  /** Nome da navegação para leitor de tela. */
  rotulo: string;
  /** Valor que significa "sem filtro" e sai da URL (ex.: "todos"). */
  valorPadrao: string;
}) {
  const { pendente, href, aplicar } = useFiltroNav();

  // Filtro novo volta à primeira página: a página 3 do recorte antigo não
  // quer dizer nada no recorte novo.
  const mudanca = (valor: string) => ({
    [param]: valor === valorPadrao ? null : valor,
    page: null,
  });

  return (
    <nav aria-label={rotulo} aria-busy={pendente} className="flex flex-wrap gap-2">
      {opcoes.map((opcao) => {
        const ativo = opcao.value === atual;
        return (
          <Link
            key={opcao.value}
            href={href(mudanca(opcao.value))}
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
              aplicar(mudanca(opcao.value));
            }}
            aria-current={ativo ? "true" : undefined}
            className={cn(
              "flex h-11 items-center rounded-lg px-4 text-base font-medium transition-colors",
              ativo
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.label}
          </Link>
        );
      })}
    </nav>
  );
}
