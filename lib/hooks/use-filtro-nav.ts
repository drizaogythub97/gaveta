"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { buildQuery, type QueryOverrides } from "@/lib/nav/query";

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
