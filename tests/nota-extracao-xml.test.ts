import { describe, expect, it } from "vitest";

import {
  lerChaveAcesso,
  lerDataEmissao,
  lerDinheiro,
  lerNumero,
  lerQuantidade,
} from "@/lib/compras/numeros";
import { extrairDeXml, XmlDeNotaInvalido } from "@/lib/compras/nfe-xml";

/**
 * Extração de nota a partir do XML da NF-e (plano 08, fase G2b, via B).
 * É a via exata: cada campo tem lugar definido no layout oficial.
 */

const CHAVE = "35260812345678901234550010000123410001234567".padEnd(44, "8");

function xmlDeNota(det: string, extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide><nNF>1234</nNF><dhEmi>2026-08-20T21:35:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000199</CNPJ><xNome>Distribuidora Modelo LTDA</xNome></emit>
      ${det}
      <total><ICMSTot><vNF>120.00</vNF></ICMSTot></total>
      ${extra}
    </infNFe>
  </NFe>
</nfeProc>`;
}

const DET_ARROZ = `<det nItem="1"><prod>
  <cProd>001</cProd><cEAN>7891000000015</cEAN><xProd>ARROZ TIPO 1 5KG</xProd>
  <NCM>10063021</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
  <qCom>6.0000</qCom><vUnCom>5.5000</vUnCom><vProd>33.00</vProd>
</prod></det>`;

const DET_FEIJAO = `<det nItem="2"><prod>
  <cProd>002</cProd><cEAN>SEM GTIN</cEAN><xProd>FEIJAO CARIOCA 1KG</xProd>
  <NCM>07133390</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
  <qCom>12.0000</qCom><vUnCom>7.2500</vUnCom><vProd>87.00</vProd>
</prod></det>`;

describe("leitura de números da nota", () => {
  it("lê cada formato pelo que ele é, sem adivinhar o separador", () => {
    // O mesmo texto vale coisas diferentes nos dois formatos — por isso
    // quem chama informa a origem, em vez de o parser tentar deduzir.
    expect(lerNumero("5.499", "ponto")).toBe(5.499);
    expect(lerNumero("5.499", "brasileiro")).toBe(5499);

    expect(lerNumero("5.5000", "ponto")).toBe(5.5);
    expect(lerNumero("1.234,56", "brasileiro")).toBe(1234.56);
    expect(lerNumero("6,0000", "brasileiro")).toBe(6);
    expect(lerNumero(12.5, "ponto")).toBe(12.5);
  });

  it("recusa o que não é número em vez de chutar", () => {
    expect(lerNumero("", "ponto")).toBeNull();
    expect(lerNumero("UN", "ponto")).toBeNull();
    expect(lerNumero("12,50 kg", "brasileiro")).toBeNull();
    expect(lerNumero(null, "ponto")).toBeNull();
    expect(lerNumero(Number.NaN, "ponto")).toBeNull();
    // Dois separadores decimais depois de normalizar = leitura duvidosa.
    expect(lerNumero("1.2.3", "ponto")).toBeNull();
  });

  it("arredonda dinheiro e quantidade nas casas do banco", () => {
    expect(lerDinheiro("5.499", "ponto")).toBe(5.5);
    expect(lerDinheiro("-1", "ponto")).toBeNull();
    expect(lerQuantidade("6.00004", "ponto")).toBe(6);
    expect(lerQuantidade("0", "ponto")).toBeNull();
    expect(lerQuantidade("-3", "ponto")).toBeNull();
  });

  it("lê a data de emissão sem escorregar de dia pelo fuso", () => {
    // 21h35 no Brasil é o dia seguinte em UTC — a data da nota é a local.
    expect(lerDataEmissao("2026-08-20T21:35:00-03:00")).toBe("2026-08-20");
    expect(lerDataEmissao("2026-08-20")).toBe("2026-08-20");
    expect(lerDataEmissao("20/08/2026")).toBe("2026-08-20");
    expect(lerDataEmissao("ontem")).toBeNull();
  });

  it("aceita a chave com espaços e recusa a incompleta", () => {
    expect(lerChaveAcesso(`NFe${CHAVE}`)).toBe(CHAVE);
    expect(lerChaveAcesso(CHAVE.replace(/(.{4})/g, "$1 "))).toBe(CHAVE);
    expect(lerChaveAcesso("123")).toBeNull();
  });
});

describe("extrairDeXml (NF-e)", () => {
  it("lê fornecedor, chave, data, total e itens", () => {
    const nota = extrairDeXml(xmlDeNota(DET_ARROZ + DET_FEIJAO));

    expect(nota.origem).toBe("xml");
    expect(nota.fornecedor).toBe("Distribuidora Modelo LTDA");
    expect(nota.chaveAcesso).toBe(CHAVE);
    expect(nota.emitidaEm).toBe("2026-08-20");
    expect(nota.total).toBe(120);
    expect(nota.itens).toHaveLength(2);

    const arroz = nota.itens[0]!;
    expect(arroz.descricao).toBe("ARROZ TIPO 1 5KG");
    expect(arroz.barcode).toBe("7891000000015");
    expect(arroz.quantidade).toBe(6);
    expect(arroz.custoUnitario).toBe(5.5);
    expect(arroz.totalLinha).toBe(33);
  });

  it("trata 'SEM GTIN' como produto sem código de barras", () => {
    const nota = extrairDeXml(xmlDeNota(DET_ARROZ + DET_FEIJAO));
    expect(nota.itens[1]!.barcode).toBeNull();
    expect(nota.itens[1]!.descricao).toBe("FEIJAO CARIOCA 1KG");
  });

  it("aceita nota com um item só (sem virar lista no parser)", () => {
    const nota = extrairDeXml(xmlDeNota(DET_ARROZ));
    expect(nota.itens).toHaveLength(1);
    expect(nota.itens[0]!.descricao).toBe("ARROZ TIPO 1 5KG");
  });

  it("aceita o XML sem a embalagem nfeProc", () => {
    const solto = `<?xml version="1.0"?>
      <NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${CHAVE}">
        <ide><dhEmi>2026-08-20T10:00:00-03:00</dhEmi></ide>
        <emit><xNome>Fornecedor Solto</xNome></emit>
        ${DET_ARROZ}
      </infNFe></NFe>`;
    const nota = extrairDeXml(solto);
    expect(nota.fornecedor).toBe("Fornecedor Solto");
    expect(nota.chaveAcesso).toBe(CHAVE);
    expect(nota.itens).toHaveLength(1);
  });

  it("pega a chave pelo protocolo quando o Id não traz", () => {
    const semId = `<?xml version="1.0"?>
      <nfeProc>
        <NFe><infNFe>
          <ide><dhEmi>2026-08-20T10:00:00-03:00</dhEmi></ide>
          <emit><xNome>Sem Id</xNome></emit>
          ${DET_ARROZ}
        </infNFe></NFe>
        <protNFe><infProt><chNFe>${CHAVE}</chNFe></infProt></protNFe>
      </nfeProc>`;
    expect(extrairDeXml(semId).chaveAcesso).toBe(CHAVE);
  });

  it("descarta item incompleto em vez de inventar valor", () => {
    const semQuantidade = `<det nItem="3"><prod>
      <xProd>ITEM SEM QUANTIDADE</xProd><vUnCom>1.00</vUnCom>
    </prod></det>`;
    const nota = extrairDeXml(xmlDeNota(DET_ARROZ + semQuantidade));
    expect(nota.itens).toHaveLength(1);
    expect(nota.itens[0]!.descricao).toBe("ARROZ TIPO 1 5KG");
  });

  it("recusa arquivo que não é NF-e", () => {
    expect(() => extrairDeXml("<html><body>oi</body></html>")).toThrow(
      XmlDeNotaInvalido,
    );
    expect(() => extrairDeXml("nem xml é")).toThrow(XmlDeNotaInvalido);
  });

  it("recusa NF-e sem nenhum item legível", () => {
    expect(() => extrairDeXml(xmlDeNota(""))).toThrow(XmlDeNotaInvalido);
  });

  it("não expande entidades declaradas no arquivo (XXE)", () => {
    // Documento com entidade externa: o parser não pode resolvê-la nem
    // vazar conteúdo do servidor para dentro do resultado.
    const comEntidade = `<?xml version="1.0"?>
      <!DOCTYPE nfeProc [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
      <nfeProc><NFe><infNFe Id="NFe${CHAVE}">
        <ide><dhEmi>2026-08-20T10:00:00-03:00</dhEmi></ide>
        <emit><xNome>&xxe;</xNome></emit>
        ${DET_ARROZ}
      </infNFe></NFe></nfeProc>`;

    // Aceitável recusar o arquivo OU aceitá-lo sem resolver a entidade; o
    // que não pode é o conteúdo do arquivo do servidor entrar no resultado.
    let fornecedor = "";
    try {
      fornecedor = extrairDeXml(comEntidade).fornecedor ?? "";
    } catch (erro) {
      expect(erro).toBeInstanceOf(XmlDeNotaInvalido);
    }
    expect(fornecedor).not.toContain("root:");
    expect(fornecedor).not.toContain("/etc/passwd");
  });
});
