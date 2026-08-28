import { XMLParser } from "fast-xml-parser";

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
 * Parser do XML da NF-e (plano 08, fase G2b, via B).
 *
 * É a via EXATA: quando o fornecedor manda o XML, cada campo tem lugar
 * definido no layout oficial, então não há heurística nenhuma aqui. Roda no
 * servidor, sem enviar o documento para terceiros e sem custo.
 *
 * Aceita as duas embalagens usuais: `nfeProc` (XML autorizado, com o
 * protocolo) e `NFe` solto. Também aceita `infNFe` na raiz, que alguns
 * emissores exportam.
 */

/** Valor "sem GTIN" que a Receita manda usar quando o produto não tem EAN. */
const SEM_GTIN = /^sem\s*gtin$/i;

type No = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is No {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Caminha por uma sequência de chaves, devolvendo undefined se faltar. */
function caminho(raiz: unknown, ...chaves: string[]): unknown {
  let atual: unknown = raiz;
  for (const chave of chaves) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[chave];
  }
  return atual;
}

/** Texto de um nó (o parser devolve string, número ou objeto com #text). */
function texto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number") return String(valor);
  if (ehObjeto(valor) && "#text" in valor) return texto(valor["#text"]);
  return null;
}

function comoLista(valor: unknown): unknown[] {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

export class XmlDeNotaInvalido extends Error {}

/**
 * Lê o XML e devolve a nota extraída. Lança `XmlDeNotaInvalido` quando o
 * arquivo não é uma NF-e reconhecível — a tela transforma isso numa
 * mensagem simples e oferece a digitação manual.
 */
export function extrairDeXml(conteudo: string): NotaExtraida {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    trimValues: true,
    // Tudo como texto: os valores da NF-e têm zeros à esquerda/à direita que
    // importam (chave de acesso, CNPJ) e a conversão automática os perderia.
    parseTagValue: false,
    parseAttributeValue: false,
    // Sem processar entidades declaradas no documento — o arquivo vem de
    // fora, e expandir entidades é o vetor clássico de XXE/billion laughs.
    processEntities: false,
  });

  let arvore: unknown;
  try {
    arvore = parser.parse(conteudo);
  } catch {
    throw new XmlDeNotaInvalido("XML ilegível");
  }

  const infNFe =
    caminho(arvore, "nfeProc", "NFe", "infNFe") ??
    caminho(arvore, "NFe", "infNFe") ??
    caminho(arvore, "infNFe");

  if (!ehObjeto(infNFe)) {
    throw new XmlDeNotaInvalido("XML não é uma NF-e");
  }

  // Chave: no atributo Id ("NFe" + 44 dígitos) ou no protocolo de autorização.
  const chaveAcesso =
    lerChaveAcesso(texto(infNFe["@Id"])) ??
    lerChaveAcesso(
      texto(caminho(arvore, "nfeProc", "protNFe", "infProt", "chNFe")),
    );

  const ide = infNFe["ide"];
  const emitidaEm =
    lerDataEmissao(texto(caminho(ide, "dhEmi"))) ??
    lerDataEmissao(texto(caminho(ide, "dEmi")));

  const fornecedor =
    texto(caminho(infNFe, "emit", "xNome")) ??
    texto(caminho(infNFe, "emit", "xFant"));

  const total = lerDinheiro(
    texto(caminho(infNFe, "total", "ICMSTot", "vNF")),
    "ponto",
  );

  const itens: ItemExtraido[] = [];
  for (const det of comoLista(infNFe["det"])) {
    if (itens.length >= MAXIMO_ITENS_EXTRAIDOS) break;

    const prod = caminho(det, "prod");
    if (!ehObjeto(prod)) continue;

    const descricao = texto(prod["xProd"]);
    // Quantidade e valor COMERCIAIS (qCom/vUnCom): é a unidade em que a
    // compra foi feita. A tributável (qTrib) pode estar em outra unidade.
    const quantidade = lerQuantidade(texto(prod["qCom"]), "ponto");
    const custoUnitario = lerDinheiro(texto(prod["vUnCom"]), "ponto");

    // Item incompleto não vira palpite: sem descrição, quantidade ou valor,
    // a linha é descartada e o usuário adiciona à mão se precisar.
    if (!descricao || quantidade === null || custoUnitario === null) continue;

    const eanBruto = texto(prod["cEAN"]) ?? texto(prod["cEANTrib"]);
    const barcode =
      eanBruto && !SEM_GTIN.test(eanBruto) && /^\d{8,14}$/.test(eanBruto)
        ? eanBruto
        : null;

    itens.push({
      descricao,
      barcode,
      quantidade,
      custoUnitario,
      totalLinha: lerDinheiro(texto(prod["vProd"]), "ponto"),
    });
  }

  if (itens.length === 0) {
    throw new XmlDeNotaInvalido("NF-e sem itens legíveis");
  }

  return { origem: "xml", fornecedor, chaveAcesso, emitidaEm, total, itens };
}
