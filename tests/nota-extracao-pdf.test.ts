// @vitest-environment node
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";

import { extrairDePdf, PdfDeNotaInvalido } from "@/lib/compras/danfe-pdf";
import { extrairNota } from "@/lib/compras/extrair";

/**
 * Extração de nota a partir do PDF do DANFE (plano 08, fase G2b, via A).
 *
 * O DANFE aqui é sintético, montado com o mesmo `jspdf` que o app já usa nos
 * comprovantes: reproduz o BLOCO e as COLUNAS do layout oficial, que é o que
 * o parser realmente lê (código · descrição · NCM · CST · CFOP · unidade ·
 * quantidade · valor unitário · valor total). O ambiente é `node` porque o
 * pdf.js precisa dele.
 */

const CHAVE = "35260812345678901234550010000123410001234567".padEnd(44, "8");

type LinhaDanfe = {
  codigo: string;
  descricao: string;
  /** Resto da descrição que não coube na coluna e transbordou para baixo. */
  continuacao?: string;
  ncm: string;
  cst?: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
};

const ARROZ: LinhaDanfe = {
  codigo: "7891000000015",
  descricao: "ARROZ TIPO 1 5KG",
  ncm: "10063021",
  cst: "0102",
  cfop: "5102",
  unidade: "UN",
  quantidade: "6,0000",
  valorUnitario: "5,5000",
  valorTotal: "33,00",
};

const FEIJAO: LinhaDanfe = {
  codigo: "IN-4471",
  descricao: "FEIJAO CARIOCA 1KG",
  ncm: "07133390",
  cfop: "5102",
  unidade: "UN",
  quantidade: "12,0000",
  valorUnitario: "7,2500",
  valorTotal: "87,00",
};

/** Monta um DANFE com camada de texto, nas colunas do layout oficial. */
function danfeComItens(
  itens: LinhaDanfe[],
  opcoes: { chave?: boolean; emitente?: boolean; total?: string } = {},
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(8);

  doc.text("DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA", 40, 40);
  if (opcoes.emitente !== false) {
    // Como num DANFE real: rótulo, razão social (que pode quebrar em mais de
    // uma linha) e, logo abaixo, o endereço — é ele que encerra o nome.
    doc.text("IDENTIFICACAO DO EMITENTE", 40, 56);
    doc.text("Distribuidora Modelo", 40, 70);
    doc.text("LTDA", 40, 84);
    doc.text("RUA DAS FLORES, 100 - Cep:01234-567", 40, 98);
    doc.text("12.345.678/0001-99", 40, 112);
    // O quadro do título fica LADO A LADO com o do emitente, na mesma
    // altura — é o que fazia o nome do fornecedor sair contaminado.
    doc.text("DANFE", 200, 56);
    doc.text("DOCUMENTO AUXILIAR DA", 200, 70);
    doc.text("NOTA FISCAL ELETRONICA", 200, 84);
  }
  if (opcoes.chave !== false) {
    doc.text("CHAVE DE ACESSO", 320, 56);
    doc.text(CHAVE.replace(/(.{4})/g, "$1 ").trim(), 320, 70);
  }
  doc.text("DATA DA EMISSAO", 40, 110);
  doc.text("20/08/2026", 150, 110);

  doc.text("DADOS DO PRODUTO / SERVICO", 40, 140);
  const colunas = [40, 110, 250, 300, 335, 370, 400, 460];
  const cabecalho = [
    "CODIGO",
    "DESCRICAO",
    "NCM/SH",
    "CST",
    "CFOP",
    "UNID",
    "QUANT",
    "VL TOTAL",
  ];
  cabecalho.forEach((titulo, i) => doc.text(titulo, colunas[i]!, 155));

  let y = 172;
  for (const item of itens) {
    const celulas = [
      item.codigo,
      item.descricao,
      item.ncm,
      item.cst ?? "",
      item.cfop,
      item.unidade,
      item.quantidade,
      item.valorUnitario,
      item.valorTotal,
    ];
    // A coluna do CST pode não existir na nota — quando falta, as demais
    // simplesmente andam para a esquerda, como acontece de verdade.
    const xs = item.cst
      ? [40, 110, 250, 292, 320, 352, 378, 424, 480]
      : [40, 110, 250, 250, 300, 340, 370, 420, 480];
    celulas.forEach((celula, i) => {
      if (celula) doc.text(celula, xs[i]!, y);
    });
    y += 10;
    // A continuação sai alinhada à COLUNA DA DESCRIÇÃO, nunca à do código —
    // é exatamente por essa posição que o parser a reconhece.
    if (item.continuacao) {
      doc.text(item.continuacao, xs[1]!, y);
      y += 10;
    }
    // Risco que separa um item do próximo, na margem.
    doc.text("- - - - - - - - - - - - - - - - - - - -", 40, y);
    y += 12;
  }

  // Rótulos numa faixa e valores na faixa DE BAIXO, cada um sob o seu — é
  // assim que o DANFE imprime os totais.
  doc.text("VALOR DO FRETE", 40, y + 30);
  doc.text("VALOR TOTAL DA NOTA", 400, y + 30);
  doc.text("0,00", 45, y + 42);
  doc.text(opcoes.total ?? "120,00", 410, y + 42);

  return new Uint8Array(doc.output("arraybuffer"));
}

describe("extrairDePdf (DANFE com camada de texto)", () => {
  it("lê os itens, a chave, a data, o fornecedor e o total", async () => {
    const nota = await extrairDePdf(danfeComItens([ARROZ, FEIJAO]));

    expect(nota.origem).toBe("pdf");
    expect(nota.chaveAcesso).toBe(CHAVE);
    expect(nota.emitidaEm).toBe("2026-08-20");
    expect(nota.fornecedor).toBe("Distribuidora Modelo LTDA");
    expect(nota.total).toBe(120);
    expect(nota.itens).toHaveLength(2);

    const arroz = nota.itens[0]!;
    expect(arroz.descricao).toBe("ARROZ TIPO 1 5KG");
    expect(arroz.quantidade).toBe(6);
    expect(arroz.custoUnitario).toBe(5.5);
    expect(arroz.totalLinha).toBe(33);
  });

  it("aproveita o código do item como EAN só quando ele é um EAN", async () => {
    const nota = await extrairDePdf(danfeComItens([ARROZ, FEIJAO]));
    // A primeira linha traz um EAN de 13 dígitos na coluna do código.
    expect(nota.itens[0]!.barcode).toBe("7891000000015");
    // A segunda traz um código interno do fornecedor — não é código de barras.
    expect(nota.itens[1]!.barcode).toBeNull();
  });

  it("junta a descrição que transbordou para a linha de baixo", async () => {
    // Classe de falha vista numa nota real: a coluna da descrição é estreita
    // e o nome do produto continua na linha seguinte, alinhado à coluna.
    const nota = await extrairDePdf(
      danfeComItens([
        { ...ARROZ, descricao: "ARROZ TIPO 1", continuacao: "PARBOILIZADO" },
        { ...FEIJAO, descricao: "FEIJAO PREMIUM MIX 1", continuacao: "5 KG" },
      ]),
    );

    expect(nota.itens).toHaveLength(2);
    // Palavra nova: junta com espaço.
    expect(nota.itens[0]!.descricao).toBe("ARROZ TIPO 1 PARBOILIZADO");
    // Número partido ao meio pela quebra de linha: junta sem espaço, senão
    // "MIX 15 KG" viraria "MIX 1 5 KG".
    expect(nota.itens[1]!.descricao).toBe("FEIJAO PREMIUM MIX 15 KG");

    // E a continuação não vira item nem bagunça os valores.
    expect(nota.itens[0]!.quantidade).toBe(6);
    expect(nota.itens[1]!.custoUnitario).toBe(7.25);
  });

  it("não deixa o quadro vizinho entrar no nome do fornecedor", async () => {
    // No DANFE, o quadro do emitente e o título "DANFE — Documento Auxiliar
    // da Nota Fiscal Eletrônica" ficam lado a lado, na mesma altura.
    const nota = await extrairDePdf(danfeComItens([ARROZ]));
    expect(nota.fornecedor).toBe("Distribuidora Modelo LTDA");
    expect(nota.fornecedor).not.toContain("DOCUMENTO AUXILIAR");
    expect(nota.fornecedor).not.toContain("DANFE");
  });

  it("lê o total com o rótulo em cima e o valor na linha de baixo", async () => {
    const nota = await extrairDePdf(
      danfeComItens([ARROZ], { total: "1.234,56" }),
    );
    expect(nota.total).toBe(1234.56);
  });

  it("lê o total também quando o emissor põe valor e rótulo na mesma linha", async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFontSize(8);
    doc.text("030027 ARROZ 10063021 000 5102 UN 1,0000 9,9000 9,90", 40, 60);
    doc.text("VALOR TOTAL DA NOTA 9,90", 40, 90);
    const nota = await extrairDePdf(new Uint8Array(doc.output("arraybuffer")));
    expect(nota.total).toBe(9.9);
  });

  it("lê a linha com e sem a coluna de CST", async () => {
    const comCst = await extrairDePdf(danfeComItens([ARROZ]));
    expect(comCst.itens).toHaveLength(1);
    expect(comCst.itens[0]!.custoUnitario).toBe(5.5);

    const semCst = await extrairDePdf(danfeComItens([FEIJAO]));
    expect(semCst.itens).toHaveLength(1);
    expect(semCst.itens[0]!.custoUnitario).toBe(7.25);
  });

  it("não confunde cabeçalho e rodapé com item da nota", async () => {
    const nota = await extrairDePdf(danfeComItens([ARROZ]));
    expect(nota.itens).toHaveLength(1);
    expect(
      nota.itens.some((item) =>
        /VALOR TOTAL|CODIGO|DANFE/i.test(item.descricao),
      ),
    ).toBe(false);
  });

  it("deixa em branco o que não achou, em vez de chutar", async () => {
    const nota = await extrairDePdf(
      danfeComItens([ARROZ], { chave: false, emitente: false }),
    );
    expect(nota.chaveAcesso).toBeNull();
    expect(nota.fornecedor).toBeNull();
    expect(nota.itens).toHaveLength(1);
  });

  it("recusa PDF sem nenhuma linha de item reconhecível", async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.text("Isto aqui é um recibo qualquer, sem tabela de produtos.", 40, 60);
    const bytes = new Uint8Array(doc.output("arraybuffer"));

    await expect(extrairDePdf(bytes)).rejects.toBeInstanceOf(PdfDeNotaInvalido);
  });

  it("recusa arquivo que não é PDF de verdade", async () => {
    const falso = new TextEncoder().encode("%PDF-1.4 mentira");
    await expect(extrairDePdf(falso)).rejects.toBeInstanceOf(PdfDeNotaInvalido);
  });
});

describe("extrairNota (escolhe o parser pelo conteúdo)", () => {
  it("reconhece o PDF pela assinatura do arquivo", async () => {
    const resultado = await extrairNota(danfeComItens([ARROZ]));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.nota.origem).toBe("pdf");
  });

  it("reconhece o XML mesmo com nome/extensão errados", async () => {
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE}">
      <ide><dhEmi>2026-08-20T10:00:00-03:00</dhEmi></ide>
      <emit><xNome>Fornecedor XML</xNome></emit>
      <det><prod><xProd>ITEM</xProd><cEAN>SEM GTIN</cEAN>
        <qCom>2.0000</qCom><vUnCom>3.0000</vUnCom><vProd>6.00</vProd>
      </prod></det>
    </infNFe></NFe></nfeProc>`;
    const resultado = await extrairNota(new TextEncoder().encode(xml));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.nota.origem).toBe("xml");
      expect(resultado.nota.fornecedor).toBe("Fornecedor XML");
    }
  });

  it("explica em português quando o arquivo não serve", async () => {
    const imagem = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);
    const resultado = await extrairNota(imagem);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain("PDF da nota");

    const vazio = await extrairNota(new Uint8Array());
    expect(vazio.ok).toBe(false);
  });

  it("avisa que PDF sem texto (foto/digitalização) não dá para ler", async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.text("nada de tabela aqui", 40, 60);
    const resultado = await extrairNota(
      new Uint8Array(doc.output("arraybuffer")),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro).toContain("digitalização");
    }
  });

  it("recusa arquivo acima do limite de tamanho", async () => {
    const gigante = new Uint8Array(9 * 1024 * 1024);
    gigante.set(new TextEncoder().encode("%PDF-"), 0);
    const resultado = await extrairNota(gigante);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain("grande demais");
  });
});
