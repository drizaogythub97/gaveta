import "server-only";

import { extractImages, getDocumentProxy } from "unpdf";

import {
  ImagemInvalida,
  MAXIMO_PIXELS_ENTRADA,
  paraBmp,
  prepararParaOcr,
} from "./imagem";
import { nomesDeProduto } from "./ocr-nomes";
import { MAXIMO_ITENS_EXTRAIDOS, type NotaExtraida } from "./tipos";

/**
 * Leitura de nota por OCR (plano 08, fase G2c) — o caminho da nota de papel
 * fotografada ou digitalizada, quando não há PDF-texto nem XML.
 *
 * O que esta via entrega, e por quê: medido numa digitalização real de
 * ~90 DPI, o OCR lê as DESCRIÇÕES de forma utilizável e os NÚMEROS não. Então
 * ela devolve a LISTA DE NOMES, com quantidade 1 e custo em branco para a
 * pessoa preencher olhando o papel. É pouco, mas é honesto — e poupa a parte
 * mais chata, que é digitar nome por nome.
 *
 * Roda no servidor, como o PDF e o XML: o arquivo não sai da infraestrutura
 * do Gaveta. O modelo de idioma (`por.traineddata`) é baixado do CDN do
 * tesseract.js na primeira execução e fica em cache — é dado do MODELO, não
 * do documento; nada do usuário é enviado.
 */

/** Uma nota de papel tem poucas páginas; ler mais é desperdício de CPU. */
const MAXIMO_PAGINAS_OCR = 3;

/**
 * Onde o modelo de idioma fica em cache. Em serverless o disco é somente
 * leitura, menos `/tmp` — sem isto o tesseract.js tenta gravar na pasta
 * atual e falha.
 */
const CACHE_DO_MODELO = "/tmp";

export class OcrIndisponivel extends Error {}
export class OcrSemProdutos extends Error {}
/** O arquivo diz ser imagem, mas o decodificador não consegue abri-lo. */
export class ImagemIlegivel extends Error {}

/**
 * Menor tamanho plausível para uma foto de nota. Serve para recusar na hora
 * um arquivo truncado, sem pagar o custo de subir o OCR só para descobrir
 * que ele não abre.
 */
const TAMANHO_MINIMO_DE_IMAGEM = 1024;

/** Assinaturas dos formatos de imagem que aceitamos direto. */
export function pareceImagem(bytes: Uint8Array): boolean {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

/**
 * Confere a estrutura mínima do arquivo de imagem ANTES de acionar o OCR.
 *
 * Sem isto, um arquivo truncado (ou que só copiou a assinatura) faz o
 * servidor iniciar o worker e baixar o modelo de idioma para só então
 * descobrir que a imagem não abre — segundos jogados fora, e o usuário
 * esperando por nada.
 */
export function imagemPareceIntegra(bytes: Uint8Array): boolean {
  if (bytes.length < TAMANHO_MINIMO_DE_IMAGEM) return false;

  // PNG: a assinatura tem 8 bytes e o primeiro bloco é sempre o IHDR.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const assinaturaCompleta =
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    const temIhdr =
      bytes[12] === 0x49 &&
      bytes[13] === 0x48 &&
      bytes[14] === 0x44 &&
      bytes[15] === 0x52;
    return assinaturaCompleta && temIhdr;
  }

  // JPEG: começa em SOI e termina em EOI (pode haver lixo depois, então a
  // busca é nos últimos bytes).
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = bytes.length - 2; i >= bytes.length - 64 && i >= 0; i--) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return true;
    }
    return false;
  }

  // WEBP: o tamanho declarado no cabeçalho RIFF tem de bater com o arquivo.
  if (bytes[0] === 0x52 && bytes[1] === 0x49) {
    const declarado =
      bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
    return declarado > 0 && declarado <= bytes.length;
  }

  return false;
}

/**
 * Reconhece o texto da imagem. `entrada` pode ser um arquivo de imagem
 * codificado (o tesseract.js decodifica) ou um BMP que montamos aqui.
 */
async function reconhecer(entrada: Uint8Array): Promise<string[]> {
  // Import dinâmico: o tesseract.js só é carregado por quem realmente manda
  // uma imagem — as vias de PDF-texto e XML não pagam esse custo.
  const { createWorker } = await import("tesseract.js");

  let worker;
  try {
    worker = await createWorker("por", 1, {
      cachePath: CACHE_DO_MODELO,
      // Sem `errorHandler`, o tesseract.js relança a falha DENTRO do
      // manipulador de mensagens do worker — vira exceção não tratada no
      // processo e, em serverless, derruba a requisição inteira. Com ele, a
      // falha chega só pela promessa do `recognize`, que tratamos abaixo.
      errorHandler: () => {},
    });
  } catch (erro) {
    throw new OcrIndisponivel(
      erro instanceof Error ? erro.message : "falha ao iniciar o OCR",
    );
  }

  try {
    const { data } = await worker.recognize(Buffer.from(entrada));
    return (data.text ?? "")
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0);
  } catch (erro) {
    // Arquivo truncado ou que só finge ser imagem: vira mensagem para o
    // usuário, nunca uma exceção solta derrubando a requisição.
    throw new ImagemIlegivel(
      erro instanceof Error ? erro.message : "imagem ilegível",
    );
  } finally {
    await worker.terminate();
  }
}

/**
 * Tira do PDF a imagem de cada página. Um PDF de digitalização é uma foto
 * embrulhada: pegar a imagem direto evita depender de um rasterizador
 * nativo só para redesenhar o que já está lá dentro.
 */
async function imagensDoPdf(arquivo: Uint8Array): Promise<Uint8Array[]> {
  const pdf = await getDocumentProxy(arquivo);
  const paginas = Math.min(pdf.numPages, MAXIMO_PAGINAS_OCR);
  const saida: Uint8Array[] = [];

  for (let numero = 1; numero <= paginas; numero++) {
    let imagens;
    try {
      imagens = await extractImages(pdf, numero);
    } catch {
      continue;
    }
    for (const imagem of imagens) {
      const { width, height, data, channels } = imagem;
      if (!width || !height || !data) continue;
      if (width * height > MAXIMO_PIXELS_ENTRADA) continue;
      // Imagem miúda é logotipo/carimbo, não a folha.
      if (width < 400 || height < 400) continue;

      try {
        const pronta = prepararParaOcr(
          data,
          width,
          height,
          channels ?? Math.max(1, Math.round(data.length / (width * height))),
        );
        saida.push(paraBmp(pronta));
      } catch (erro) {
        if (erro instanceof ImagemInvalida) continue;
        throw erro;
      }
    }
  }
  return saida;
}

/**
 * Lê a nota por OCR e devolve só o que dá para afirmar: os nomes.
 * Lança `OcrSemProdutos` quando não reconheceu a lista de produtos.
 */
export async function extrairPorOcr(
  bytes: Uint8Array,
  origemPdf: boolean,
): Promise<NotaExtraida> {
  // Arquivo que não é imagem íntegra é recusado de imediato: não vale subir
  // o OCR para descobrir isso lá na frente.
  if (!origemPdf && !imagemPareceIntegra(bytes)) {
    throw new ImagemIlegivel("Arquivo de imagem incompleto");
  }

  const entradas = origemPdf ? await imagensDoPdf(bytes) : [bytes];

  if (entradas.length === 0) {
    throw new OcrSemProdutos("Nenhuma imagem legível no arquivo");
  }

  const linhas: string[] = [];
  for (const entrada of entradas) {
    linhas.push(...(await reconhecer(entrada)));
  }

  const nomes = nomesDeProduto(linhas).slice(0, MAXIMO_ITENS_EXTRAIDOS);
  if (nomes.length === 0) {
    throw new OcrSemProdutos("Não reconheci a lista de produtos");
  }

  return {
    origem: "foto",
    // Fornecedor, chave, data e total NÃO são lidos por esta via: em papel
    // digitalizado eles saem tão errados quanto os valores, e um dado errado
    // que passa despercebido é pior que um campo em branco.
    fornecedor: null,
    chaveAcesso: null,
    emitidaEm: null,
    total: null,
    itens: nomes.map((descricao) => ({
      descricao,
      barcode: null,
      quantidade: 1,
      // Em branco de propósito: o OCR não lê número com confiança.
      custoUnitario: null,
      totalLinha: null,
    })),
  };
}
