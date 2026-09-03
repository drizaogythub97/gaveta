"use client";

import { Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";

/**
 * Link que avisa que foi tocado.
 *
 * Nasceu de uma medição, não de uma suposição. As trocas de tela dentro do
 * sistema — Produtos → Novo produto, Estoque → Entrada por nota, e as voltas
 * — levam de **0,9 a 1,1 segundo** em produção, e nesse tempo **nada**
 * aparecia: o carregador de tela cheia (`app/(app)/loading.tsx`) não chega a
 * ser acionado, porque a rota já vem pré-carregada e a navegação não
 * "suspende" — o tempo é o navegador montando a tela nova, e isso um
 * boundary de Suspense não enxerga.
 *
 * Um segundo sem resposta nenhuma é justamente o que faz a pessoa tocar de
 * novo. A resposta certa aqui é a mesma do nível 3 da proposta: **falar no
 * lugar onde a pessoa tocou**. O ícone do link vira um giro no instante do
 * clique — sem atraso, porque não há o que esperar para decidir: a navegação
 * ou começou, ou não.
 *
 * `useLinkStatus` só funciona DENTRO de um `<Link>`, daí o componente
 * interno.
 */
function Conteudo({
  icone,
  children,
}: {
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      {pending ? (
        <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin" />
      ) : (
        icone
      )}
      {children}
      {pending ? <span className="sr-only">Abrindo…</span> : null}
    </>
  );
}

export function LinkAcao({
  href,
  className,
  icone,
  children,
  "aria-label": ariaLabel,
  prefetch,
}: {
  href: string;
  className?: string;
  /** Ícone normal do link; some e dá lugar ao giro enquanto navega. */
  icone?: React.ReactNode;
  children: React.ReactNode;
  "aria-label"?: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      prefetch={prefetch}
    >
      <Conteudo icone={icone}>{children}</Conteudo>
    </Link>
  );
}
