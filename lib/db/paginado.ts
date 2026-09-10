/**
 * Trazer TODAS as linhas de uma consulta, em páginas.
 *
 * O PostgREST corta a resposta num teto (1000 linhas, no padrão do Supabase)
 * e não avisa: a consulta devolve 200, ou 1000, e o código segue achando que
 * recebeu o conjunto inteiro. Era assim que a conferência do caixa somava
 * menos do que vendeu e que o catálogo da nota "pedia 5000" sem nunca
 * receber mais que o teto. Ver o achado B de `docs/10-ACHADOS-DE-LOGICA.md`.
 *
 * Aqui o corte deixa de ser silencioso: as páginas são pedidas até acabar, e
 * se o TETO DE SEGURANÇA for atingido quem chamou recebe `truncou: true` e
 * decide o que dizer na tela.
 */

/** Teto por página. É o padrão do PostgREST no Supabase. */
const POR_PAGINA = 1000;

/** Teto de segurança: acima disso, a tela precisa de outra estratégia. */
const MAXIMO_PADRAO = 20_000;

type Pagina<T> = { data: T[] | null; error: { message: string } | null };

export async function todasAsLinhas<T>(
  /** Recebe o intervalo (inclusive) e devolve a consulta já com `.range()`. */
  buscarPagina: (de: number, ate: number) => PromiseLike<Pagina<T>>,
  opcoes: { maximo?: number } = {},
): Promise<{ linhas: T[]; truncou: boolean; erro: string | null }> {
  const maximo = opcoes.maximo ?? MAXIMO_PADRAO;
  const linhas: T[] = [];

  for (let de = 0; de < maximo; de += POR_PAGINA) {
    const ate = Math.min(de + POR_PAGINA, maximo) - 1;
    const { data, error } = await buscarPagina(de, ate);
    if (error) {
      return { linhas, truncou: false, erro: error.message };
    }
    const pagina = data ?? [];
    linhas.push(...pagina);
    // Página incompleta = acabou. É o sinal que o PostgREST dá sem custar
    // uma consulta a mais só para contar.
    if (pagina.length < ate - de + 1) {
      return { linhas, truncou: false, erro: null };
    }
  }

  return { linhas, truncou: true, erro: null };
}
