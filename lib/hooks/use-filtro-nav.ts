"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useTransition,
} from "react";

import { buildQuery, type QueryOverrides } from "@/lib/nav/query";

/**
 * Quantos filtros estão navegando agora, e quem quer ser avisado disso.
 *
 * Existe porque `useTransition` é local ao componente: o `pendente` nasce
 * dentro do chip ou da lista suspensa que foi clicada, e a REGIÃO DOS
 * RESULTADOS — que é onde a espera precisa aparecer — é outro componente,
 * muitas vezes renderizado no servidor. Em vez de espalhar contexto por
 * todas as páginas, o estado de "tem filtro em trânsito" mora aqui, e
 * qualquer componente pode ler com `useFiltroPendente`.
 */
let navegando = 0;
const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function ajustar(delta: number) {
  navegando = Math.max(0, navegando + delta);
  for (const ouvinte of ouvintes) ouvinte();
}

/**
 * `true` enquanto algum filtro da tela está navegando.
 *
 * No servidor devolve `false`, então a primeira pintura nunca sai esmaecida.
 */
export function useFiltroPendente(): boolean {
  return useSyncExternalStore(
    assinar,
    () => navegando > 0,
    () => false,
  );
}

/**
 * O jeito padrão de aplicar filtro no Gaveta.
 *
 * Duas garantias, e as duas importam:
 *
 * 1. **Preserva a query inteira.** Só muda o que o filtro pediu — a aba
 *    aberta, a ordenação e os demais recortes continuam onde estavam.
 * 2. **Navega dentro de uma transição.** Com `startTransition`, o React
 *    mantém o conteúdo atual na tela enquanto o servidor responde, em vez
 *    de trocar tudo pelo carregador de tela cheia (`app/(app)/loading.tsx`).
 *    Quem filtra vê a tela que já estava lá esmaecer e atualizar; nada
 *    "pisca" nem volta ao topo.
 *
 * `pendente` é para sinalizar a espera SÓ na região dos resultados —
 * o próprio filtro continua utilizável.
 */
export function useFiltroNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendente, startTransition] = useTransition();

  // Publica a espera deste filtro para a região dos resultados. A limpeza
  // desconta, então transição cancelada ou componente desmontado no meio não
  // deixa a tela esmaecida para sempre.
  useEffect(() => {
    if (!pendente) return;
    ajustar(1);
    return () => ajustar(-1);
  }, [pendente]);

  const base = useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ""),
    [searchParams],
  );

  /** URL do filtro, para usar em `<Link>` (navegação com clique do meio, etc.). */
  const href = useCallback(
    (overrides: QueryOverrides) => buildQuery(base, overrides),
    [base],
  );

  /** Aplica o filtro sem recarregar a página e sem pular para o topo. */
  const aplicar = useCallback(
    (overrides: QueryOverrides) => {
      const destino = href(overrides);
      startTransition(() => {
        router.push(destino, { scroll: false });
      });
    },
    [href, router],
  );

  return { pendente, href, aplicar };
}
