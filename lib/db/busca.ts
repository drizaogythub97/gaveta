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
 * O filtro EXATO roda pelo próprio PostgREST, sem função no banco: cada
 * vogal (e o ç, o ñ) vira uma classe com as suas variantes acentuadas, e o
 * filtro usa `imatch` — o `~*` do Postgres, que já ignora a caixa, inclusive
 * de letra acentuada, com a colação `en_US.UTF-8` do banco. Conferido contra
 * o banco real em 16/11/2026, junto com a conferência de que não há texto
 * gravado com o acento separado da letra (NFD).
 *
 * Por cima dele vem o PARECIDO (fim do arquivo), para erro de digitação:
 * "aroz" acha "Arroz", "maira" acha "Maria". O banco pré-seleciona por
 * trigramas (RPC `produtos_parecidos`, migration 0025) e a regra daqui
 * decide — a mesma do FiadoApp, que a aplica sobre a lista em memória.
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

// ── Parecido: erro de digitação ─────────────────────────────────────────

/**
 * Aproxima a grafia do som, para "Sousa" e "Souza" — ou "Thiago" e
 * "Tiago", "Raphael" e "Rafael", "Kátia" e "Cátia", "Ivone" e "Yvone",
 * "Jéssica" e "Géssica", "Rafaella" e "Rafaela" — serem a MESMA palavra. Só
 * vale na comparação aproximada; o filtro exato não passa por aqui.
 */
function simplificarSom(palavra: string): string {
  return palavra
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/^h/, "")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/k/g, "c")
    .replace(/c(?=[ei])/g, "s")
    .replace(/g(?=[ei])/g, "j")
    .replace(/z/g, "s")
    // Só letra dobrada: número repetido é outro número ("500" não é "50").
    .replace(/(\p{L})\1+/gu, "$1");
}

/** Palavras para a comparação aproximada: sem acento nem pontuação. */
function palavrasDoSom(texto: string): string[] {
  return normalizarBusca(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((palavra) => palavra !== "")
    .map(simplificarSom);
}

/**
 * Distância de edição com troca de vizinhas: quantas letras é preciso
 * trocar, tirar, pôr ou inverter para uma palavra virar a outra ("maira" →
 * "maria" é 1). Para no `limite` — passou dele, tanto faz o quanto.
 */
function distancia(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let duasAtras: number[] = [];
  let umaAtras = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        umaAtras[j] + 1,
        atual[j - 1] + 1,
        umaAtras[j - 1] + custo,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, duasAtras[j - 2] + 1);
      }
      atual.push(d);
      menor = Math.min(menor, d);
    }
    if (menor > limite) return limite + 1;
    duasAtras = umaAtras;
    umaAtras = atual;
  }
  return Math.min(umaAtras[b.length], limite + 1);
}

/**
 * Quantos erros cabem numa palavra: nenhum até 2 letras ("jo" errado é
 * outra coisa), 1 até 7, 2 daí em diante.
 */
function tolerancia(tamanho: number): number {
  return tamanho <= 2 ? 0 : tamanho <= 7 ? 1 : 2;
}

/**
 * O quanto a palavra digitada se parece com ALGUMA palavra do registro, de
 * 0 (nada) a 1 (contida nela). Compara com a palavra inteira, com o começo
 * dela — quem ainda está digitando — e com ela colada à seguinte
 * ("cocacola" × "Coca Cola").
 */
function parecenca(termo: string, palavrasDoRegistro: string[]): number {
  const limite = tolerancia(termo.length);
  let melhor = 0;
  for (let i = 0; i < palavrasDoRegistro.length; i++) {
    const palavra = palavrasDoRegistro[i];
    // Palavra curta só casa inteira: o "50" de "50%" não é o "500" de outro
    // nome — pedaço curto é trabalho do filtro exato (achado E de docs/10).
    if (termo.length <= 2 ? palavra === termo : palavra.includes(termo)) {
      return 1;
    }
    if (limite === 0) continue;
    const alvos = [palavra, palavra + (palavrasDoRegistro[i + 1] ?? "")];
    if (termo.length >= 4) {
      alvos.push(
        palavra.slice(0, termo.length),
        palavra.slice(0, termo.length + 1),
      );
    }
    for (const alvo of alvos) {
      const d = distancia(termo, alvo, limite);
      if (d <= limite) melhor = Math.max(melhor, 1 - d / (termo.length + 1));
    }
  }
  return melhor;
}

/**
 * Os parecidos com a busca, do mais ao menos parecido — para quando o
 * filtro exato não acha nada (ou acha pouco). Toda palavra digitada precisa
 * ter par no registro, com a tolerância de erro do tamanho dela.
 */
export function parecidos<T>(
  itens: readonly T[],
  busca: string,
  texto: (item: T) => string,
): T[] {
  const todas = [...new Set(palavrasDoSom(busca.slice(0, MAX_LETRAS)))];
  const relevantes = todas.filter((palavra) => !LIGACOES.has(palavra));
  const termos = (relevantes.length > 0 ? relevantes : todas).slice(
    0,
    MAX_TERMOS,
  );
  if (termos.length === 0) return [];
  return itens
    .map((item) => {
      const palavrasDoRegistro = palavrasDoSom(texto(item));
      let nota = 0;
      for (const termo of termos) {
        const p = parecenca(termo, palavrasDoRegistro);
        if (p === 0) return null;
        nota += p;
      }
      return { item, rotulo: texto(item), nota };
    })
    .filter((c): c is { item: T; rotulo: string; nota: number } => c !== null)
    .sort((a, b) => b.nota - a.nota || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map(({ item }) => item);
}

/** Toda palavra da busca está contida no texto (sem acento, sem caixa)? */
export function casaComBusca(texto: string, termos: string[]): boolean {
  const alvo = normalizarBusca(texto);
  return termos.every((termo) => alvo.includes(termo));
}

/**
 * Sugestões para uma lista curta, com a lista inteira em memória: primeiro
 * o que bate exato, do mais ao menos parecido; depois, até completar o
 * limite, os parecidos por erro de digitação.
 */
export function sugerir<T>(
  itens: readonly T[],
  busca: string,
  texto: (item: T) => string,
  limite: number,
): T[] {
  const termos = termosDaBusca(busca);
  if (termos.length === 0) return [];
  const exatos = ordenarPorSemelhanca(
    itens.filter((item) => casaComBusca(texto(item), termos)),
    busca,
    texto,
  );
  if (exatos.length >= limite) return exatos.slice(0, limite);
  const jaEstao = new Set(exatos);
  const resto = itens.filter((item) => !jaEstao.has(item));
  return [...exatos, ...parecidos(resto, busca, texto)].slice(0, limite);
}
