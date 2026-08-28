import { MAXIMO_ITENS_EXTRAIDOS } from "./tipos";

/**
 * Nomes de produto a partir do texto do OCR (plano 08, fase G2c).
 *
 * Por que só nomes: medido numa nota de papel real digitalizada (~90 DPI), o
 * OCR lê as DESCRIÇÕES de forma utilizável e os NÚMEROS não — a coluna de
 * valores sai como "3) 7300) — 7acof". Então esta fase entrega o que ela
 * consegue entregar com honestidade: a lista de nomes, para a pessoa não
 * digitar tudo do zero. Quantidade e custo ficam em branco, para ela
 * preencher olhando o papel. Nada de chutar número.
 *
 * A âncora usada aqui é diferente da do PDF-texto: no OCR as colunas não são
 * confiáveis, mas o nome do produto vem em CAIXA ALTA e o lixo do
 * reconhecimento vem em minúsculas e símbolos. O maior trecho contínuo de
 * palavras em caixa alta é o nome.
 */

/** Onde começa o bloco de produtos — em DANFE e em espelho de pedido. */
const INICIO_DOS_PRODUTOS =
  /DADOS\s+DO(S)?\s+PRODUTO|DESCRI[ÇC][ÃA]O\s+DO\s+PROD/i;

/** Onde ele termina. */
const FIM_DOS_PRODUTOS =
  /DADOS\s+ADICIONAIS|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|C[ÁA]LCULO\s+DO\s+ISSQN|VALOR\s+TOTAL\s+DA\s+NOTA|OUTRAS\s+INFORMA/i;

/** Palavras de cabeçalho de coluna: nunca são nome de produto. */
const CABECALHO =
  /^(C[ÓO]D|CODIGO|DESCRI|PRODUTO|SERVI|NCM|CST|CFOP|UNID|UN|QUANT|QTDE|VALOR|VLR|TOTAL|UNIT|IPI|ICMS|BC|ALIQ|EAN|TABELA|PRE[ÇC]O)/i;

/**
 * Um pedaço que pode fazer parte do nome: palavra em caixa alta, número de
 * embalagem ("10", "10/500", "1/5G") ou conector curto ("DE", "COM").
 */
function ehPedacoDeNome(token: string): boolean {
  if (token.length === 0) return false;
  // Conectores minúsculos que aparecem no meio de nomes.
  if (/^(de|do|da|dos|das|com|e|em|para|sem)$/i.test(token)) return true;
  // Palavra em caixa alta (aceita acento, ponto, barra e dígitos colados).
  return /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9./%-]*$/u.test(token);
}

/** Quantas letras a candidata tem — número puro não é nome de produto. */
function letras(texto: string): number {
  return (texto.match(/\p{L}/gu) ?? []).length;
}

/**
 * O maior trecho contínuo de pedaços que parecem nome, dentro da linha.
 * Devolve null quando nada na linha convence.
 */
export function nomeNaLinha(linha: string): string | null {
  const tokens = linha.split(/\s+/).filter((t) => t.length > 0);

  let melhor: string[] = [];
  let atual: string[] = [];
  for (const token of tokens) {
    if (ehPedacoDeNome(token)) {
      atual.push(token);
      if (atual.length > melhor.length) melhor = [...atual];
    } else {
      atual = [];
    }
  }

  // Conector solto na ponta não faz parte do nome ("MISTURA DE" → "MISTURA").
  while (
    melhor.length > 0 &&
    /^(de|do|da|dos|das|com|e|em|para|sem)$/i.test(melhor[melhor.length - 1]!)
  ) {
    melhor.pop();
  }
  while (
    melhor.length > 0 &&
    /^(de|do|da|dos|das|com|e|em|para|sem)$/i.test(melhor[0]!)
  ) {
    melhor.shift();
  }

  const nome = melhor.join(" ").trim();
  if (melhor.length < 2) return null;
  if (nome.length < 8) return null;
  if (letras(nome) < 4) return null;
  if (CABECALHO.test(nome)) return null;
  return nome;
}

/**
 * Percorre o texto do OCR e devolve os nomes de produto encontrados, na
 * ordem em que aparecem. Só olha DENTRO do bloco de produtos: fora dele,
 * qualquer linha em caixa alta viraria item (endereço, razão social,
 * cabeçalho). Sem o bloco, devolve lista vazia — melhor não entregar nada
 * do que entregar lixo.
 */
export function nomesDeProduto(linhas: string[]): string[] {
  const inicio = linhas.findIndex((l) => INICIO_DOS_PRODUTOS.test(l));
  if (inicio === -1) return [];

  const nomes: string[] = [];
  const vistos = new Set<string>();

  for (let i = inicio + 1; i < linhas.length; i++) {
    if (FIM_DOS_PRODUTOS.test(linhas[i]!)) break;
    if (nomes.length >= MAXIMO_ITENS_EXTRAIDOS) break;

    const nome = nomeNaLinha(linhas[i]!);
    if (!nome) continue;

    // A mesma linha do cabeçalho da tabela às vezes é lida duas vezes.
    const chave = nome.toUpperCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(nome);
  }

  return nomes;
}
