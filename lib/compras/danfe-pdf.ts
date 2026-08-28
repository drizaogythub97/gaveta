import { getDocumentProxy } from "unpdf";

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
} from "./tipos";

/**
 * Parser do DANFE em PDF com camada de texto (plano 08, fase G2b, via A).
 *
 * Roda no servidor com biblioteca open source (pdf.js empacotado no `unpdf`),
 * sem enviar o documento para terceiros e sem custo. PDF que é só imagem
 * (digitalização) não tem texto e cai fora — a tela avisa e oferece o XML ou
 * a digitação manual.
 *
 * A extração é TOLERANTE de propósito (o layout do DANFE muda de emissor para
 * emissor): reconhece o que dá para reconhecer com confiança e deixa o resto
 * para a conferência. Nunca chuta valor.
 */

/** Teto de páginas lidas — nota fiscal grande ainda é pequena. */
const MAXIMO_PAGINAS = 20;

/** Duas frases do mesmo item ficam na mesma linha se o Y quase coincide. */
const TOLERANCIA_LINHA = 2.5;

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

export class PdfDeNotaInvalido extends Error {}

type Fragmento = { x: number; texto: string };

/**
 * Reconstrói as linhas visuais do PDF. O pdf.js entrega fragmentos soltos com
 * posição; agrupar por Y (e ordenar por X) devolve a linha como ela aparece
 * impressa — bem mais confiável que concatenar o texto na ordem do arquivo.
 */
async function lerLinhas(arquivo: Uint8Array): Promise<string[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(arquivo);
  } catch {
    throw new PdfDeNotaInvalido("PDF ilegível");
  }

  const linhas: string[] = [];
  const paginas = Math.min(pdf.numPages, MAXIMO_PAGINAS);

  for (let numero = 1; numero <= paginas; numero++) {
    const pagina = await pdf.getPage(numero);
    const conteudo = await pagina.getTextContent();

    const porLinha: { y: number; partes: Fragmento[] }[] = [];
    for (const item of conteudo.items) {
      const texto = "str" in item ? item.str : "";
      if (!texto || !texto.trim()) continue;
      const transform = "transform" in item ? item.transform : null;
      if (!transform) continue;

      const x = Number(transform[4]);
      const y = Number(transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const existente = porLinha.find(
        (linha) => Math.abs(linha.y - y) <= TOLERANCIA_LINHA,
      );
      if (existente) {
        existente.partes.push({ x, texto });
      } else {
        porLinha.push({ y, partes: [{ x, texto }] });
      }
    }

    // De cima para baixo (no PDF, Y cresce para cima).
    porLinha.sort((a, b) => b.y - a.y);
    for (const linha of porLinha) {
      const texto = linha.partes
        .sort((a, b) => a.x - b.x)
        .map((parte) => parte.texto)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (texto) linhas.push(texto);
    }
  }

  return linhas;
}

/**
 * Nome do emitente: o DANFE rotula o bloco, então dá para ancorar nele.
 *
 * Cuidado do mundo real: no DANFE o quadro do emitente e o da chave de
 * acesso ficam LADO A LADO, na mesma altura — a linha reconstruída traz os
 * dois. Por isso o nome é cortado no primeiro blocão de dígitos (chave,
 * CNPJ, CEP ou telefone), que nunca faz parte da razão social.
 */
function acharFornecedor(linhas: string[]): string | null {
  const indice = linhas.findIndex((linha) =>
    /IDENTIFICA[ÇC][ÃA]O\s+DO\s+EMITENTE/i.test(linha),
  );
  if (indice === -1) return null;

  for (const candidata of linhas.slice(indice + 1, indice + 4)) {
    const semNumeros = candidata.replace(/(?:\d[\s.\/-]?){8,}.*$/u, "").trim();
    if (semNumeros.length < 3 || semNumeros.length > 120) continue;
    // Precisa sobrar letra: só pontuação ou número não é razão social.
    if (!/\p{L}/u.test(semNumeros)) continue;
    if (/^(DANFE|DOCUMENTO AUXILIAR|CHAVE DE ACESSO)/i.test(semNumeros)) {
      continue;
    }
    return semNumeros;
  }
  return null;
}

function acharDataEmissao(linhas: string[]): string | null {
  const indice = linhas.findIndex((linha) =>
    /DATA\s+D[AE]\s+EMISS[ÃA]O/i.test(linha),
  );
  if (indice === -1) return null;

  for (const candidata of linhas.slice(indice, indice + 3)) {
    const achou = DATA_BRASILEIRA.exec(candidata);
    if (achou) return lerDataEmissao(achou[1]);
  }
  return null;
}

function acharTotal(linhas: string[]): number | null {
  const linha = linhas.find((atual) =>
    /VALOR\s+TOTAL\s+DA\s+NOTA/i.test(atual),
  );
  if (!linha) return null;

  const numeros = linha.match(/[\d.]+,\d{2}/g);
  if (!numeros || numeros.length === 0) return null;
  return lerDinheiro(numeros[numeros.length - 1]!, "brasileiro");
}

/**
 * Lê o PDF e devolve a nota extraída. Lança `PdfDeNotaInvalido` quando não há
 * camada de texto ou nenhuma linha de item foi reconhecida.
 */
export async function extrairDePdf(arquivo: Uint8Array): Promise<NotaExtraida> {
  const linhas = await lerLinhas(arquivo);

  if (linhas.length === 0) {
    throw new PdfDeNotaInvalido("PDF sem camada de texto");
  }

  const itens: ItemExtraido[] = [];
  for (const linha of linhas) {
    if (itens.length >= MAXIMO_ITENS_EXTRAIDOS) break;

    const achou = LINHA_DE_ITEM.exec(linha);
    if (!achou) continue;

    const descricao = achou[COLUNA.descricao]?.trim();
    const quantidade = lerQuantidade(achou[COLUNA.quantidade], "brasileiro");
    const custoUnitario = lerDinheiro(
      achou[COLUNA.valorUnitario],
      "brasileiro",
    );

    // Linha incompleta não vira palpite.
    if (!descricao || quantidade === null || custoUnitario === null) continue;

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
    throw new PdfDeNotaInvalido("Nenhum item reconhecido no PDF");
  }

  const chaveNoTexto = CHAVE_IMPRESSA.exec(linhas.join(" "));

  return {
    origem: "pdf",
    fornecedor: acharFornecedor(linhas),
    chaveAcesso: chaveNoTexto ? lerChaveAcesso(chaveNoTexto[0]) : null,
    emitidaEm: acharDataEmissao(linhas),
    total: acharTotal(linhas),
    itens,
  };
}
