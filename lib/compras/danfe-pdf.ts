import { getDocumentProxy } from "unpdf";

import { agruparEmLinhas, DanfeIlegivel, interpretarDanfe } from "./danfe";
import type { NotaExtraida } from "./tipos";

/**
 * Leitura do DANFE em PDF com camada de texto (plano 08, fase G2b, via A).
 *
 * Roda no servidor com biblioteca open source (pdf.js empacotado no `unpdf`),
 * sem enviar o documento para terceiros e sem custo. Este arquivo tem uma
 * responsabilidade só: transformar o PDF nas LINHAS VISUAIS do documento. O
 * reconhecimento do que é fornecedor, item, data e total é do `danfe.ts`, que
 * também atende a leitura por OCR (G2c).
 *
 * PDF que é só imagem (foto ou digitalização) não tem texto: cai fora daqui
 * com `PdfDeNotaInvalido` e é a vez do OCR.
 */

/** Teto de páginas lidas — nota fiscal grande ainda é pequena. */
const MAXIMO_PAGINAS = 20;

/** Duas frases do mesmo item ficam na mesma linha se o Y quase coincide. */
const TOLERANCIA_LINHA = 2.5;

export class PdfDeNotaInvalido extends Error {}

/**
 * PDF que não tem camada de texto nenhuma — é foto embrulhada. Só este caso
 * justifica gastar CPU tentando o OCR: um PDF COM texto que mesmo assim não
 * teve itens reconhecidos não vai melhorar sendo lido como imagem.
 */
export class PdfSemTexto extends PdfDeNotaInvalido {}

/**
 * O pdf.js **consome** o buffer que recebe: ele o transfere para o próprio
 * "worker", e o `Uint8Array` de origem fica com zero byte. Quem tentar ler o
 * mesmo arquivo de novo — e o Gaveta tenta, porque um PDF sem texto ainda é
 * candidato a OCR — recebe um buffer detached e leva
 * `DataCloneError: Cannot transfer object of unsupported type`.
 *
 * Isso derrubou a página de nova compra em produção (2026-08-29) com uma
 * nota digitalizada. Cada leitura leva a SUA cópia; o arquivo do chamador
 * continua intacto.
 */
export function copiaParaPdfJs(arquivo: Uint8Array): Uint8Array {
  return arquivo.slice();
}

/**
 * O pdf.js entrega fragmentos soltos com posição; agrupá-los por altura
 * devolve a linha como ela aparece impressa — bem mais confiável que
 * concatenar o texto na ordem em que está no arquivo.
 */
async function lerLinhas(arquivo: Uint8Array) {
  let pdf;
  try {
    pdf = await getDocumentProxy(copiaParaPdfJs(arquivo));
  } catch {
    throw new PdfDeNotaInvalido("PDF ilegível");
  }

  const pedacos: { x: number; y: number; texto: string }[] = [];
  const paginas = Math.min(pdf.numPages, MAXIMO_PAGINAS);

  for (let numero = 1; numero <= paginas; numero++) {
    const pagina = await pdf.getPage(numero);
    const conteudo = await pagina.getTextContent();

    for (const item of conteudo.items) {
      const texto = "str" in item ? item.str : "";
      if (!texto || !texto.trim()) continue;
      const transform = "transform" in item ? item.transform : null;
      if (!transform) continue;

      pedacos.push({
        x: Number(transform[4]),
        // Páginas seguintes ficam "abaixo": desloca o Y para a ordenação
        // continuar valendo de uma página para a outra.
        y: Number(transform[5]) - (numero - 1) * 100_000,
        texto,
      });
    }
  }

  return agruparEmLinhas(pedacos, {
    toleranciaY: TOLERANCIA_LINHA,
    yCresceParaCima: true,
  });
}

/**
 * Lê o PDF e devolve a nota extraída. Lança `PdfDeNotaInvalido` quando não há
 * camada de texto ou nenhuma linha de item foi reconhecida.
 */
export async function extrairDePdf(arquivo: Uint8Array): Promise<NotaExtraida> {
  const linhas = await lerLinhas(arquivo);

  if (linhas.length === 0) {
    throw new PdfSemTexto("PDF sem camada de texto");
  }

  try {
    return interpretarDanfe(linhas, "pdf");
  } catch (erro) {
    if (erro instanceof DanfeIlegivel) {
      throw new PdfDeNotaInvalido(erro.message);
    }
    throw erro;
  }
}
