import { extrairDePdf, PdfDeNotaInvalido } from "./danfe-pdf";
import { extrairDeXml, XmlDeNotaInvalido } from "./nfe-xml";
import { TAMANHO_MAXIMO_ARQUIVO, type NotaExtraida } from "./tipos";

/**
 * Porta de entrada da extração (plano 08, fase G2b): recebe o arquivo que o
 * usuário enviou, descobre o que ele é de verdade e chama o parser certo.
 *
 * O formato é decidido pelo CONTEÚDO, não pela extensão nem pelo `type` que
 * o navegador informa — os dois vêm do cliente e não valem como garantia.
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
      if (erro instanceof PdfDeNotaInvalido) {
        return {
          ok: false,
          erro: "Não deu para ler os itens deste PDF. Se ele for uma foto ou digitalização, não há texto para o sistema ler — use o XML da nota ou digite os itens.",
        };
      }
      throw erro;
    }
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
    erro: "Envie o PDF da nota (DANFE) ou o arquivo XML da nota fiscal.",
  };
}
