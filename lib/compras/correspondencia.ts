/**
 * Motor de correspondência da nota importada (plano 08, fase G2b, §1.2.3).
 *
 * Para cada item extraído, nesta ordem:
 *   a) código de barras da nota bate com um produto → RECONHECIDO;
 *   b) o nome é bem parecido com o de um produto → SUGERIDO (o usuário
 *      confirma na tela de conferência);
 *   c) nada disso → NOVO, para ser cadastrado com os dados da nota.
 *
 * A comparação de nomes é local e determinística: o catálogo de uma loja
 * cabe folgado em memória, então uma consulta só resolve a nota inteira —
 * bem melhor que uma ida ao banco por item.
 */

export type ProdutoCatalogo = {
  id: string;
  name: string;
  trackStock: boolean;
};

/**
 * Abaixo disso a "semelhança" já não convence e o item vai como novo. Valor
 * escolhido para exigir que a maioria das palavras significativas coincida
 * ("ARROZ TIPO 1 5KG" ↔ "Arroz 5kg" passa; "ARROZ" ↔ "AÇÚCAR" não).
 */
export const LIMIAR_SEMELHANCA = 0.5;

/** Palavras curtas demais para distinguir produto (unidades, artigos…). */
const IRRELEVANTES = new Set(["de", "da", "do", "com", "sem", "un", "kg", "g"]);

/**
 * Normaliza para comparar: sem acento, sem pontuação, minúsculo e sem
 * espaços repetidos. "Açúcar Cristal 1kg" e "ACUCAR CRISTAL 1KG" viram o
 * mesmo texto.
 */
export function normalizarNome(nome: string): string {
  return (
    nome
      .normalize("NFD")
      // \p{M} = as marcas de acentuação que o NFD separou da letra. Escrito
      // pela propriedade Unicode, e não por um intervalo de caracteres
      // invisíveis, que é ilegível e não sobrevive a conversão de encoding.
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

function palavras(nome: string): Set<string> {
  return new Set(
    normalizarNome(nome)
      .split(" ")
      .filter((palavra) => palavra.length > 0 && !IRRELEVANTES.has(palavra)),
  );
}

/**
 * Semelhança entre dois nomes, de 0 a 1, pelo coeficiente de Dice sobre as
 * palavras significativas: `2 × comuns / (total de A + total de B)`.
 *
 * Dice e não Jaccard porque a assimetria aqui é a regra, não a exceção: a
 * descrição da nota costuma ser mais detalhada que o nome do cadastro
 * ("ARROZ TIPO 1 5KG" × "Arroz 5kg"). Jaccard punia esse caso legítimo até
 * o limiar; Dice o reconhece e continua separando produtos diferentes
 * ("ARROZ INTEGRAL 1KG" × "Arroz 5kg" fica abaixo do limiar).
 */
export function semelhanca(a: string, b: string): number {
  const normalizadoA = normalizarNome(a);
  const normalizadoB = normalizarNome(b);
  if (normalizadoA.length === 0 || normalizadoB.length === 0) return 0;
  if (normalizadoA === normalizadoB) return 1;

  const palavrasA = palavras(a);
  const palavrasB = palavras(b);
  if (palavrasA.size === 0 || palavrasB.size === 0) return 0;

  let comuns = 0;
  for (const palavra of palavrasA) {
    if (palavrasB.has(palavra)) comuns++;
  }
  return (2 * comuns) / (palavrasA.size + palavrasB.size);
}

/**
 * Melhor candidato do catálogo para a descrição da nota, ou `null` quando
 * nenhum chega perto o bastante. Empate é resolvido pela ordem do catálogo
 * (estável), para a mesma nota dar sempre o mesmo resultado.
 */
export function escolherProduto(
  descricao: string,
  catalogo: readonly ProdutoCatalogo[],
  limiar: number = LIMIAR_SEMELHANCA,
): ProdutoCatalogo | null {
  let melhor: ProdutoCatalogo | null = null;
  let melhorNota = 0;

  for (const produto of catalogo) {
    const nota = semelhanca(descricao, produto.name);
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = produto;
    }
  }

  return melhorNota >= limiar ? melhor : null;
}
