import { valorParaOr } from "@/lib/db/like";

/**
 * Busca por nome que acha o registro pelo PEDAÇO e SEM o acento.
 *
 * Antes, cada tela fazia `ilike '%termo%'` com o texto inteiro, e isso
 * falhava de dois jeitos que a pessoa no balcão sente na hora:
 *
 * - **acento**: "racao" não achava "Ração" — o `ilike` só ignora a caixa;
 * - **pedaços fora de ordem**: "maria souza" não achava "Maria Aparecida
 *   Souza", porque o texto inteiro tinha de aparecer colado.
 *
 * Agora o que se digita vira PALAVRAS, e cada uma precisa aparecer no
 * registro — em qualquer ordem, em qualquer posição, com ou sem acento. É o
 * que acha o cliente pelo sobrenome ou pela referência, e o produto por uma
 * palavra do meio do nome, já enquanto se digita.
 *
 * O banco não tem a extensão `unaccent`, e instalá-la seria mudança de
 * estrutura num banco que o FiadoApp divide. A troca é feita do lado de cá:
 * cada vogal (e o ç, o ñ) vira uma classe com as suas variantes acentuadas,
 * e o filtro usa `imatch` — o `~*` do Postgres, que já ignora a caixa,
 * inclusive de letra acentuada, com a colação `en_US.UTF-8` do banco.
 * Conferido contra o banco real em 16/11/2026, junto com a conferência de
 * que não há texto gravado com o acento separado da letra (NFD).
 */

/** Palavras que ligam nomes ("Pão DE Açúcar") e não decidem nada sozinhas. */
const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Busca é coisa curta — e cada letra vira uma classe na URL da consulta. */
const MAX_LETRAS = 60;
const MAX_TERMOS = 6;

const VARIANTES: Record<string, string> = {
  a: "aáàâãä",
  e: "eéèêë",
  i: "iíìîï",
  o: "oóòôõö",
  u: "uúùûü",
  c: "cç",
  n: "nñ",
};

/** Minúsculo e sem acento: "Ração" e "RACAO" viram o mesmo texto. */
export function normalizarBusca(texto: string): string {
  return (
    texto
      .normalize("NFD")
      // \p{M} = as marcas que o NFD separou da letra (acento, til, cedilha).
      .replace(/\p{M}/gu, "")
      .toLowerCase()
  );
}

/** As palavras do texto, normalizadas e na ordem em que foram escritas. */
function palavras(texto: string): string[] {
  return normalizarBusca(texto)
    .split(/\s+/)
    .filter((palavra) => palavra !== "");
}

/**
 * As palavras que entram no filtro: sem repetição e sem as de ligação —
 * quem digita "ração de filhote" quer "Ração Filhotes", que não tem "de".
 * Se a busca for SÓ ligação ("de"), ela fica: a pessoa ainda está digitando.
 *
 * A pontuação continua dentro da palavra, de propósito: buscar "50%" tem de
 * achar o "50%" do nome, não tudo o que tem "50" (achado E de `docs/10`).
 */
export function termosDaBusca(texto: string): string[] {
  const todas = [...new Set(palavras(texto.slice(0, MAX_LETRAS)))];
  const relevantes = todas.filter((palavra) => !LIGACOES.has(palavra));
  return (relevantes.length > 0 ? relevantes : todas).slice(0, MAX_TERMOS);
}

/**
 * Expressão regular (dialeto do Postgres) que acha a palavra com ou sem
 * acento: "acai" vira `[aáàâãä][cç][aáàâãä][iíìîï]`. Letra e número entram
 * como são; o resto (`%`, `_`, `.`…) vai escapado e vale literal.
 */
export function padraoSemAcento(termo: string): string {
  return Array.from(normalizarBusca(termo), (letra) => {
    const variantes = VARIANTES[letra];
    if (variantes) return `[${variantes}]`;
    return /[\p{L}\p{N}]/u.test(letra) ? letra : `\\${letra}`;
  }).join("");
}

/**
 * O nome INTEIRO, sem acento e sem diferenciar caixa — é o Enter do caixa,
 * que põe o produto no carrinho pelo nome exato. Espaço a mais ou a menos
 * entre as palavras não atrapalha. Espera texto com alguma palavra.
 */
export function padraoNomeExato(texto: string): string {
  return `^\\s*${palavras(texto).map(padraoSemAcento).join("\\s+")}\\s*$`;
}

/**
 * Condição para o `or()` do PostgREST: a palavra aparece em QUALQUER uma
 * das colunas (nome, sobrenome ou referência do cliente). Vai uma chamada
 * de `or()` por palavra — vários `or()` na mesma consulta somam como E,
 * conferido contra o banco real.
 */
export function emAlgumaColuna(
  colunas: readonly string[],
  termo: string,
): string {
  const padrao = valorParaOr(padraoSemAcento(termo));
  return colunas.map((coluna) => `${coluna}.imatch.${padrao}`).join(",");
}

const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

/**
 * Quanto o texto (já normalizado) se parece com a busca: por palavra,
 * começo do texto vale 3, começo de outra palavra vale 2, meio vale 1.
 */
function pontuar(texto: string, termos: string[]): number {
  let total = 0;
  for (const termo of termos) {
    if (texto.startsWith(termo)) {
      total += 3;
      continue;
    }
    let posicao = texto.indexOf(termo);
    let pontos = posicao >= 0 ? 1 : 0;
    while (posicao > 0) {
      if (!LETRA_OU_NUMERO.test(texto[posicao - 1])) {
        pontos = 2;
        break;
      }
      posicao = texto.indexOf(termo, posicao + 1);
    }
    total += pontos;
  }
  return total;
}

/**
 * Põe na frente o que mais se parece com o que foi digitado. A lista de
 * sugestões mostra poucos itens, e o certo tem de estar entre eles: com
 * "arroz", "Arroz 5kg" vem antes de "Biscoito de arroz". Empate fica em
 * ordem alfabética.
 */
export function ordenarPorSemelhanca<T>(
  itens: readonly T[],
  busca: string,
  texto: (item: T) => string,
): T[] {
  const termos = termosDaBusca(busca);
  return itens
    .map((item) => ({
      item,
      rotulo: texto(item),
      pontos: pontuar(normalizarBusca(texto(item)), termos),
    }))
    .sort(
      (a, b) =>
        b.pontos - a.pontos || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    )
    .map(({ item }) => item);
}
