"use client";

import { useFiltroPendente } from "@/lib/hooks/use-filtro-nav";
import { cn } from "@/lib/utils";

import styles from "./regiao-em-espera.module.css";

/**
 * Nível 2 do feedback de carregamento: a espera aparece **na região dos
 * resultados**, sem trocar a tela.
 *
 * Por que não o loader de marca aqui: filtrar não é carregar uma tela nova.
 * O carregador de tela cheia apagaria a lista que a pessoa está lendo,
 * devolveria tudo meio segundo depois e ainda jogaria a rolagem para o topo
 * — parece defeito, não resposta. Aqui a lista continua no lugar, esmaece de
 * leve e um fio corre em cima até o servidor responder.
 *
 * Envolve **só os resultados**. O controle que a pessoa acabou de tocar fica
 * de fora de propósito: ela precisa ver que o toque pegou, e continuar
 * podendo mexer nele.
 *
 * O `pendente` vem do estado compartilhado de `useFiltroNav` — não é preciso
 * passar nada da página, que continua sendo Server Component.
 */
export function RegiaoEmEspera({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pendente = useFiltroPendente();

  return (
    <div
      aria-busy={pendente}
      className={cn("relative flex flex-col gap-6", className)}
    >
      {pendente ? <span aria-hidden="true" className={styles.fita} /> : null}
      <div
        className={cn(
          "flex flex-col gap-6 transition-opacity duration-200",
          // `pointer-events-none` evita o clique no item que está prestes a
          // ser substituído: a pessoa acertaria o produto errado.
          pendente && "pointer-events-none opacity-40",
        )}
      >
        {children}
      </div>
    </div>
  );
}
