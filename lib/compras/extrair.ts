import { extrairDePdf, PdfDeNotaInvalido, PdfSemTexto } from "./danfe-pdf";
import { extrairDeXml, XmlDeNotaInvalido } from "./nfe-xml";
import {
  extrairPorOcr,
  ImagemIlegivel,
  OcrIndisponivel,
  OcrSemProdutos,
  pareceImagem,
} from "./ocr-imagem";
import { TAMANHO_MAXIMO_ARQUIVO, type NotaExtraida } from "./tipos";

/**
 * Porta de entrada da extração (plano 08, fases G2b e G2c): recebe o arquivo
 * que o usuário enviou, descobre o que ele é de verdade e chama o leitor
 * certo.
 *
 * O formato é decidido pelo CONTEÚDO, não pela extensão nem pelo `type` que
 * o navegador informa — os dois vêm do cliente e não valem como garantia.
 *
 * Ordem de qualidade, e é por isso que a tela recomenda XML e PDF:
 *   1. XML da NF-e   — exato, cada campo tem lugar no layout oficial;
 *   2. PDF com texto — bom, mas depende de reconhecer as colunas impressas;
 *   3. imagem (OCR)  — só a lista de nomes, porque número lido de foto não
 *      é confiável.
 */

export type ResultadoExtracao =
  | { ok: true; nota: NotaExtraida }
  | { ok: false; erro: string };

/** "%PDF-" no começo do arquivo é a assinatura do formato. */
function parecePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/** Tenta o OCR e traduz as falhas para uma frase que o usuário entende. */
async function tentarOcr(
  bytes: Uint8Array,
  origemPdf: boolean,
): Promise<ResultadoExtracao> {
  try {
    return { ok: true, nota: await extrairPorOcr(bytes, origemPdf) };
  } catch (erro) {
    if (erro instanceof OcrSemProdutos) {
      return {
        ok: false,
        erro: origemPdf
          ? "Este PDF é uma imagem (foto ou digitalização) e não deu para reconhecer a lista de produtos. Use o PDF original que o fornecedor envia, ou o XML, ou digite os itens abaixo."
          : "Não deu para reconhecer a lista de produtos nesta imagem. Se puder, use o PDF ou o XML da nota — o resultado é bem melhor. Ou digite os itens abaixo.",
      };
    }
    if (erro instanceof ImagemIlegivel) {
      return {
        ok: false,
        erro: "Não consegui abrir esta imagem. Envie o PDF da nota, o XML, ou uma foto em JPG ou PNG.",
      };
    }
    if (erro instanceof OcrIndisponivel) {
      return {
        ok: false,
        erro: "A leitura de imagem está indisponível no momento. Use o PDF ou o XML da nota, ou digite os itens.",
      };
    }
    throw erro;
  }
}

export async function extrairNota(
  bytes: Uint8Array,
): Promise<ResultadoExtracao> {
  if (bytes.length === 0) {
    return { ok: false, erro: "O arquivo está vazio." };
  }
  if (bytes.length > TAMANHO_MAXIMO_ARQUIVO) {
    return { ok: false, erro: "O arquivo é grande demais para uma nota." };
  }

  if (parecePdf(bytes)) {
    try {
      return { ok: true, nota: await extrairDePdf(bytes) };
    } catch (erro) {
      // Só o PDF SEM texto vira foto embrulhada e merece o OCR — é o caso da
      // nota digitalizada no celular. Um PDF que TEM texto e mesmo assim não
      // rendeu itens não melhora sendo lido como imagem: gastaria CPU para
      // devolver menos do que o próprio texto já não deu.
      if (erro instanceof PdfSemTexto) {
        return tentarOcr(bytes, true);
      }
      if (erro instanceof PdfDeNotaInvalido) {
        return {
          ok: false,
          erro: "Não deu para reconhecer os itens deste PDF. Confira se é a nota certa, use o XML, ou digite os itens abaixo.",
        };
      }
      throw erro;
    }
  }

  if (pareceImagem(bytes)) {
    return tentarOcr(bytes, false);
  }

  const texto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/<\s*(\?xml|nfeProc|NFe|infNFe)\b/.test(texto)) {
    try {
      return { ok: true, nota: extrairDeXml(texto) };
    } catch (erro) {
      if (erro instanceof XmlDeNotaInvalido) {
        return {
          ok: false,
          erro: "Este XML não parece ser o de uma nota fiscal eletrônica.",
        };
      }
      throw erro;
    }
  }

  return {
    ok: false,
    erro: "Envie o PDF da nota (DANFE), o arquivo XML ou uma foto da nota.",
  };
}
