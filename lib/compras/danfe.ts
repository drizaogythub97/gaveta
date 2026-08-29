import {
  lerChaveAcesso,
  lerDataEmissao,
  lerDinheiro,
  lerQuantidade,
} from "./numeros";
import {
  MAXIMO_ITENS_EXTRAIDOS,
  type ItemExtraido,
  type NotaExtraida,
  type OrigemExtracao,
} from "./tipos";

/**
 * Interpretação do DANFE (plano 08, fases G2b/G2c).
 *
 * Este arquivo não sabe de onde o texto veio. Ele recebe as LINHAS VISUAIS
 * do documento — cada uma com os seus fragmentos e a posição horizontal de
 * cada um — e devolve a nota extraída.
 *
 * Essa separação é o que permite ler a mesma nota por dois caminhos: o
 * pdf.js, quando o PDF tem camada de texto (`danfe-pdf.ts`), e o OCR, quando
 * a nota é foto ou digitalização (`ocr-imagem.ts`). Os dois montam `Linha[]`
 * e caem aqui — a lógica de reconhecimento não é duplicada nem diverge.
 *
 * A leitura é TOLERANTE de propósito (o layout muda de emissor para
 * emissor): reconhece o que dá para reconhecer com confiança e deixa o resto
 * para a conferência. Nunca chuta valor.
 */

/** Um pedaço de texto e onde ele começa na horizontal. */
export type Fragmento = { x: number; texto: string };

/** Uma linha como ela aparece impressa, com os fragmentos em ordem. */
export type Linha = { texto: string; fragmentos: Fragmento[] };

export class DanfeIlegivel extends Error {}

/**
 * Uma linha de item do bloco "DADOS DO PRODUTO / SERVIÇO". O layout oficial é
 *   CÓDIGO · DESCRIÇÃO · NCM · [CST] · CFOP · UNIDADE · QTD · V.UNIT · V.TOTAL
 * e o que ancora o reconhecimento são o NCM (8 dígitos) e o CFOP (4 dígitos):
 * juntos, praticamente não aparecem por acaso.
 *
 * Grupos numerados (e não nomeados) porque o `target` do projeto é ES2017 —
 * o mapa COLUNA abaixo faz o papel dos nomes.
 */
const LINHA_DE_ITEM =
  /^([A-Za-z0-9._/-]{1,30})\s+(.+?)\s+(\d{8})\s+(?:(\d{2,4})\s+)?([1-7]\d{3})\s+([A-Za-zÀ-ÿ.]{1,8})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/u;

/** Posição de cada coluna no resultado de LINHA_DE_ITEM. */
const COLUNA = {
  codigo: 1,
  descricao: 2,
  ncm: 3,
  cst: 4,
  cfop: 5,
  unidade: 6,
  quantidade: 7,
  valorUnitario: 8,
  valorTotal: 9,
} as const;

/** 44 dígitos, com ou sem os espaços que o DANFE imprime a cada 4. */
const CHAVE_IMPRESSA = /(?<!\d)(?:\d[\s.]?){43}\d(?!\d)/;

const DATA_BRASILEIRA = /\b(\d{2}\/\d{2}\/\d{4})\b/;

const NUMERO_BR = /^[\d.]+,\d{2}$/;

const ROTULO_EMITENTE = /IDENTIFICA[ÇC][ÃA]O\s+DO\s+EMITENTE/i;

/**
 * O que encerra a razão social no quadro do emitente: o endereço (que vem
 * logo abaixo do nome em qualquer DANFE) ou o título de outro bloco. Os
 * títulos são do layout oficial, não de um emissor específico.
 */
const FIM_DA_RAZAO_SOCIAL =
  /\b(RUA|AV|AVENIDA|ROD|RODOVIA|ESTRADA|TRAVESSA|PRA[ÇC]A|ALAMEDA|CEP|FONE|TEL)\b|Cep:|Fone:|DESTINAT[ÁA]RIO|C[ÁA]LCULO DO IMPOSTO|CALCULO DO IMPOSTO|DADOS DO PRODUTO|TRANSPORTADOR|DADOS ADICIONAIS|FATURA|DATA D[AE] EMISS[ÃA]O|CHAVE DE ACESSO/i;

/** Quantas linhas de continuação de descrição são aceitas por item. */
const MAXIMO_CONTINUACOES = 3;

/** Folga para considerar que duas linhas começam na mesma coluna. */
const TOLERANCIA_COLUNA = 2;

function acharFornecedor(linhas: Linha[]): string | null {
  const indice = linhas.findIndex((linha) => ROTULO_EMITENTE.test(linha.texto));
  if (indice === -1) return null;

  // A razão social fica na MESMA COLUNA do rótulo. Ancorar nela é o que
  // impede o quadro vizinho (o título "DANFE — Documento Auxiliar da Nota
  // Fiscal Eletrônica", que fica lado a lado e na mesma altura) de entrar
  // no nome do fornecedor.
  const coluna = linhas[indice]!.fragmentos.find((f) =>
    ROTULO_EMITENTE.test(f.texto),
  )?.x;
  if (coluna === undefined) return null;

  const partes: string[] = [];
  for (let i = indice + 1; i < linhas.length && i <= indice + 8; i++) {
    const naColuna = linhas[i]!.fragmentos.filter(
      (f) => Math.abs(f.x - coluna) <= TOLERANCIA_COLUNA,
    );
    // Linha só do quadro vizinho: pula, o nome pode continuar abaixo.
    if (naColuna.length === 0) continue;

    const texto = naColuna
      .map((f) => f.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!texto) continue;
    // Chegou no endereço ou em outro bloco: a razão social acabou.
    if (FIM_DA_RAZAO_SOCIAL.test(texto)) break;

    // Rede de segurança: se o CNPJ vier colado, corta no blocão de dígitos.
    const semNumeros = texto.replace(/(?:\d[\s./-]?){8,}.*$/u, "").trim();
    if (semNumeros.length === 0 || !/\p{L}/u.test(semNumeros)) continue;

    partes.push(semNumeros);
    if (partes.length === 4) break;
  }

  const nome = partes.join(" ").trim();
  if (nome.length < 3 || nome.length > 120) return null;
  return nome;
}

function acharDataEmissao(linhas: Linha[]): string | null {
  const indice = linhas.findIndex((linha) =>
    /DATA\s+D[AE]\s+EMISS[ÃA]O/i.test(linha.texto),
  );
  if (indice === -1) return null;

  for (const candidata of linhas.slice(indice, indice + 3)) {
    const achou = DATA_BRASILEIRA.exec(candidata.texto);
    if (achou) return lerDataEmissao(achou[1]);
  }
  return null;
}

/**
 * Total da nota. O DANFE costuma imprimir os rótulos numa faixa e os valores
 * na faixa DE BAIXO, cada um sob o seu rótulo — então achar o rótulo não
 * basta: é preciso descer uma linha e pegar o número alinhado a ele.
 */
function acharTotal(linhas: Linha[]): number | null {
  const indice = linhas.findIndex((linha) =>
    /VALOR\s+TOTAL\s+DA\s+NOTA/i.test(linha.texto),
  );
  if (indice === -1) return null;

  // Alguns emissores põem o valor na própria linha do rótulo.
  const naMesmaLinha = linhas[indice]!.texto.match(/[\d.]+,\d{2}/g);
  if (naMesmaLinha && naMesmaLinha.length > 0) {
    return lerDinheiro(naMesmaLinha[naMesmaLinha.length - 1]!, "brasileiro");
  }

  const coluna = linhas[indice]!.fragmentos.find((f) =>
    /VALOR\s+TOTAL\s+DA\s+NOTA/i.test(f.texto),
  )?.x;
  if (coluna === undefined) return null;

  const abaixo = linhas[indice + 1];
  if (!abaixo) return null;

  // Números são alinhados à direita, então o valor começa um pouco depois do
  // rótulo: pega o número mais próximo da coluna, sem voltar para a anterior.
  const candidatos = abaixo.fragmentos
    .filter((f) => NUMERO_BR.test(f.texto.trim()))
    .filter((f) => f.x >= coluna - TOLERANCIA_COLUNA * 5)
    .sort((a, b) => a.x - b.x);

  const valor = candidatos[0]?.texto.trim();
  return valor ? lerDinheiro(valor, "brasileiro") : null;
}

/** Linha só de traços/pontos: o risco que separa um item do próximo. */
function ehSeparador(texto: string): boolean {
  return /^[\s.\-_=•·|]+$/u.test(texto);
}

/**
 * Junta a continuação à descrição.
 *
 * O renderizador quebra a linha onde a coluna acaba — inclusive no meio de
 * uma palavra. Quando a descrição termina em dígito E a continuação começa
 * em dígito, a quebra quase certamente partiu um número ao meio
 * ("...MIX 1" + "5 KG" = "...MIX 15 KG"), porque uma palavra nova teria sido
 * quebrada no espaço. Nos demais casos, junta com espaço.
 */
function juntarContinuacao(descricao: string, continuacao: string): string {
  const partiuNumero = /\d$/.test(descricao) && /^\d/.test(continuacao);
  return partiuNumero
    ? `${descricao}${continuacao}`
    : `${descricao} ${continuacao}`;
}

/**
 * Descrição longa não cabe na coluna e transborda para a linha de baixo —
 * é assim em qualquer DANFE, porque a coluna da descrição é estreita.
 *
 * A continuação é reconhecida pela POSIÇÃO: ela começa alinhada à coluna da
 * descrição, nunca à do código. Isso separa a continuação do risco que
 * divide os itens e dos títulos de seção seguintes, que começam na margem.
 */
function continuacaoDaDescricao(
  linhas: Linha[],
  indiceDoItem: number,
): string[] {
  // A coluna da descrição é onde começa o 2º fragmento da linha do item (o
  // 1º é o código). Sem esse fragmento, não há como ancorar: não arrisca.
  const colunaDescricao = linhas[indiceDoItem]?.fragmentos[1]?.x;
  if (colunaDescricao === undefined) return [];

  const pedacos: string[] = [];
  for (
    let i = indiceDoItem + 1;
    i < linhas.length && pedacos.length < MAXIMO_CONTINUACOES;
    i++
  ) {
    const seguinte = linhas[i]!;
    if (ehSeparador(seguinte.texto)) break;
    if (LINHA_DE_ITEM.test(seguinte.texto)) break;

    const inicio = Math.min(...seguinte.fragmentos.map((f) => f.x));
    if (inicio < colunaDescricao - TOLERANCIA_COLUNA) break;

    pedacos.push(seguinte.texto);
  }
  return pedacos;
}

/**
 * Monta a nota a partir das linhas visuais do documento.
 * Lança `DanfeIlegivel` quando nenhuma linha de item foi reconhecida.
 */
export function interpretarDanfe(
  linhas: Linha[],
  origem: OrigemExtracao,
): NotaExtraida {
  if (linhas.length === 0) {
    throw new DanfeIlegivel("Documento sem texto");
  }

  const itens: ItemExtraido[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (itens.length >= MAXIMO_ITENS_EXTRAIDOS) break;

    const achou = LINHA_DE_ITEM.exec(linhas[i]!.texto);
    if (!achou) continue;

    let descricao = achou[COLUNA.descricao]?.trim();
    const quantidade = lerQuantidade(achou[COLUNA.quantidade], "brasileiro");
    const custoUnitario = lerDinheiro(
      achou[COLUNA.valorUnitario],
      "brasileiro",
    );

    // Linha incompleta não vira palpite.
    if (!descricao || quantidade === null || custoUnitario === null) continue;

    for (const pedaco of continuacaoDaDescricao(linhas, i)) {
      descricao = juntarContinuacao(descricao, pedaco);
    }

    const codigo = achou[COLUNA.codigo] ?? "";
    const barcode = /^\d{8,14}$/.test(codigo) ? codigo : null;

    itens.push({
      descricao,
      barcode,
      quantidade,
      custoUnitario,
      totalLinha: lerDinheiro(achou[COLUNA.valorTotal], "brasileiro"),
    });
  }

  if (itens.length === 0) {
    throw new DanfeIlegivel("Nenhum item reconhecido");
  }

  const chaveNoTexto = CHAVE_IMPRESSA.exec(
    linhas.map((linha) => linha.texto).join(" "),
  );

  return {
    origem,
    fornecedor: acharFornecedor(linhas),
    chaveAcesso: chaveNoTexto ? lerChaveAcesso(chaveNoTexto[0]) : null,
    emitidaEm: acharDataEmissao(linhas),
    total: acharTotal(linhas),
    itens,
  };
}

/**
 * Agrupa fragmentos soltos (com posição) nas linhas visuais do documento.
 * Serve tanto para o pdf.js quanto para o OCR: os dois entregam pedaços de
 * texto com coordenada, e a linha é o que está na mesma altura.
 *
 * `y` cresce para CIMA no PDF e para BAIXO na imagem — por isso o sentido da
 * ordenação é informado por quem chama.
 */
export function agruparEmLinhas(
  pedacos: { x: number; y: number; texto: string }[],
  opcoes: { toleranciaY: number; yCresceParaCima: boolean },
): Linha[] {
  const porLinha: { y: number; partes: Fragmento[] }[] = [];

  for (const pedaco of pedacos) {
    const texto = pedaco.texto;
    if (!texto || !texto.trim()) continue;
    if (!Number.isFinite(pedaco.x) || !Number.isFinite(pedaco.y)) continue;

    const existente = porLinha.find(
      (linha) => Math.abs(linha.y - pedaco.y) <= opcoes.toleranciaY,
    );
    if (existente) {
      existente.partes.push({ x: pedaco.x, texto });
    } else {
      porLinha.push({ y: pedaco.y, partes: [{ x: pedaco.x, texto }] });
    }
  }

  // Sempre de cima para baixo, seja qual for o sentido do eixo.
  porLinha.sort((a, b) => (opcoes.yCresceParaCima ? b.y - a.y : a.y - b.y));

  const linhas: Linha[] = [];
  for (const linha of porLinha) {
    const fragmentos = linha.partes.sort((a, b) => a.x - b.x);
    const texto = fragmentos
      .map((parte) => parte.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (texto) linhas.push({ texto, fragmentos });
  }
  return linhas;
}
