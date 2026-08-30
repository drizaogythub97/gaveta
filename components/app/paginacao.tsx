"use client";

import Link from "next/link";

import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";

const CLASSE_LINK =
  "border-border text-foreground hover:bg-muted flex h-12 items-center justify-center rounded-lg border px-5 text-base font-medium";
const CLASSE_DESABILITADO =
  "border-border text-muted-foreground flex h-12 cursor-not-allowed items-center justify-center rounded-lg border px-5 text-base font-medium opacity-50";

function BotaoPagina({
  href,
  onNavegar,
  texto,
}: {
  href: string;
  onNavegar: () => void;
  texto: string;
}) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        // Clique com modificador (nova aba, nova janela) segue o caminho
        // normal do navegador; só o clique comum vira transição.
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
        onNavegar();
      }}
      className={CLASSE_LINK}
    >
      {texto}
    </Link>
  );
}

/**
 * Paginação padrão das listagens.
 *
 * Segue o mesmo contrato dos filtros: a página vive na URL (`?page=`) e a
 * troca acontece por transição — o resto da tela permanece, sem carregador
 * de tela cheia e sem salto para o topo. Os botões continuam sendo `<Link>`
 * para quem abre em outra aba ou usa o teclado.
 */
export function Paginacao({
  paginaAtual,
  totalPaginas,
  total,
  singular,
  plural,
  rotulo,
}: {
  paginaAtual: number;
  totalPaginas: number;
  total: number;
  singular: string;
  plural: string;
  /** Nome da navegação para leitor de tela. */
  rotulo: string;
}) {
  const { pendente, href, aplicar } = useFiltroNav();

  if (totalPaginas <= 1) return null;

  // A página 1 não vai para a URL: o endereço limpo é o da primeira página.
  const paraPagina = (alvo: number) => ({
    page: alvo > 1 ? String(alvo) : null,
  });

  const botao = (alvo: number, texto: string) => (
    <BotaoPagina
      href={href(paraPagina(alvo))}
      onNavegar={() => aplicar(paraPagina(alvo))}
      texto={texto}
    />
  );

  return (
    <nav
      aria-label={rotulo}
      aria-busy={pendente}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {paginaAtual > 1 ? (
        botao(paginaAtual - 1, "← Anterior")
      ) : (
        <span aria-disabled="true" className={CLASSE_DESABILITADO}>
          ← Anterior
        </span>
      )}
      <p className="text-muted-foreground text-base">
        Página <span className="text-foreground font-medium">{paginaAtual}</span>{" "}
        de {totalPaginas} · {total} {total === 1 ? singular : plural}
      </p>
      {paginaAtual < totalPaginas ? (
        botao(paginaAtual + 1, "Próxima →")
      ) : (
        <span aria-disabled="true" className={CLASSE_DESABILITADO}>
          Próxima →
        </span>
      )}
    </nav>
  );
}
