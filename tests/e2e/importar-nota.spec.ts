import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

import { STATE_FUNCIONAL } from "../../playwright.config";

import {
  chaveFicticia,
  hojeISO,
  loadUsers,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Validação da fase G2b — importar a nota de um arquivo (protocolo docs/09).
 *
 * Roda logado como usuário DESCARTÁVEL e confere na UI **e no banco** que o
 * caminho inteiro funciona: arquivo → extração no servidor → correspondência
 * com o catálogo → conferência humana → nota lançada com a origem certa.
 *
 * ⚠️ Ordem: este arquivo roda depois de `compras.spec.ts` (ordem alfabética
 * do Playwright), que confere contagens globais de notas/gastos do usuário.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const CODIGO_CAFE = "7899000000011";
const PRODUTO_CAFE = "Cafe Importado 500g";
const PRODUTO_CHA = "Chá mate natural";
const FORNECEDOR_XML = "Importadora do Arquivo LTDA";
const FORNECEDOR_PDF = "Atacado do PDF LTDA";

let user: TestUser;
let app: SupabaseClient;
let cafeId: string;
let chaveXml: string;
let chavePdf: string;

const sel = {
  itens: 'section[aria-labelledby="nota-itens"]',
};

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);
  chaveXml = chaveFicticia();
  chavePdf = chaveFicticia();

  // Produto com CÓDIGO DE BARRAS: é o que a nota reconhece de forma exata.
  const { data: cafe, error: erroCafe } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: PRODUTO_CAFE,
      price: 22,
      cost_price: 8,
      track_stock: true,
      stock_quantity: 5,
    })
    .select("id")
    .single();
  expect(erroCafe).toBeNull();
  cafeId = (cafe as { id: string }).id;

  const { error: erroCodigo } = await app
    .from("product_barcodes")
    .insert({ product_id: cafeId, user_id: user.id, barcode: CODIGO_CAFE });
  expect(erroCodigo).toBeNull();

  // Produto SEM código de barras: só o nome pode ligá-lo à nota.
  const { error: erroCha } = await app.from("products").insert({
    user_id: user.id,
    name: PRODUTO_CHA,
    price: 12,
    cost_price: 4,
    track_stock: true,
    stock_quantity: 0,
  });
  expect(erroCha).toBeNull();
});

/** XML de NF-e com os três casos do motor: EAN, nome parecido e produto novo. */
function xmlDaNota(chave: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${chave}" versao="4.00">
    <ide><nNF>987</nNF><dhEmi>${hojeISO()}T09:15:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000199</CNPJ><xNome>${FORNECEDOR_XML}</xNome></emit>
    <det nItem="1"><prod>
      <cProd>A1</cProd><cEAN>${CODIGO_CAFE}</cEAN>
      <xProd>CAFE IMPORTADO 500G</xProd>
      <qCom>4.0000</qCom><vUnCom>9.5000</vUnCom><vProd>38.00</vProd>
    </prod></det>
    <det nItem="2"><prod>
      <cProd>A2</cProd><cEAN>SEM GTIN</cEAN>
      <xProd>CHA MATE NATURAL 250G</xProd>
      <qCom>3.0000</qCom><vUnCom>5.0000</vUnCom><vProd>15.00</vProd>
    </prod></det>
    <det nItem="3"><prod>
      <cProd>A3</cProd><cEAN>SEM GTIN</cEAN>
      <xProd>BISCOITO AGUA E SAL 200G</xProd>
      <qCom>10.0000</qCom><vUnCom>2.0000</vUnCom><vProd>20.00</vProd>
    </prod></det>
    <total><ICMSTot><vNF>73.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;
}

/** DANFE em PDF com camada de texto, nas colunas do layout oficial. */
function pdfDaNota(chave: string): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(8);
  doc.text("DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA", 40, 40);
  doc.text("IDENTIFICACAO DO EMITENTE", 40, 56);
  doc.text(FORNECEDOR_PDF, 40, 70);
  doc.text("CHAVE DE ACESSO", 320, 56);
  doc.text(chave.replace(/(.{4})/g, "$1 ").trim(), 320, 70);
  doc.text("DATA DA EMISSAO", 40, 110);
  const [ano, mes, dia] = hojeISO().split("-");
  doc.text(`${dia}/${mes}/${ano}`, 150, 110);

  doc.text("DADOS DO PRODUTO / SERVICO", 40, 140);
  doc.text("CODIGO", 40, 155);
  doc.text("DESCRICAO", 110, 155);

  const colunas = [40, 110, 250, 292, 320, 352, 378, 424, 480];
  const linha = [
    CODIGO_CAFE,
    "CAFE IMPORTADO 500G",
    "09011110",
    "0102",
    "5102",
    "UN",
    "2,0000",
    "11,0000",
    "22,00",
  ];
  linha.forEach((celula, i) => doc.text(celula, colunas[i]!, 172));

  doc.text("VALOR TOTAL DA NOTA", 40, 210);
  doc.text("22,00", 460, 210);

  return Buffer.from(doc.output("arraybuffer"));
}

test("1. XML da NF-e preenche a tela com os três tipos de item", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");
  await expect(page.getByText("Tem o arquivo da nota?")).toBeVisible();

  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.xml",
    mimeType: "text/xml",
    buffer: Buffer.from(xmlDaNota(chaveXml), "utf8"),
  });

  // Cabeçalho preenchido a partir do próprio arquivo.
  await expect(page.locator("#supplier")).toHaveValue(FORNECEDOR_XML);
  await expect(page.locator("#issuedOn")).toHaveValue(hojeISO());
  await expect(page.locator("#accessKey")).toHaveValue(chaveXml);

  const linhas = page.locator(`${sel.itens} li`);
  await expect(linhas).toHaveCount(3);

  // (a) casou pelo CÓDIGO DE BARRAS → reconhecido, com o nome do cadastro.
  const cafe = linhas.filter({ hasText: PRODUTO_CAFE });
  await expect(cafe).toContainText("Já cadastrado");
  await expect(cafe).toContainText("Na nota está:");
  await expect(cafe).toContainText("CAFE IMPORTADO 500G");
  await expect(cafe.getByLabel("Quantidade")).toHaveValue("4");
  await expect(cafe.getByLabel("Custo por unidade")).toHaveValue(/^R\$\s9,50$/);

  // (b) casou pelo NOME → sugestão, que a pessoa confirma.
  const cha = linhas.filter({ hasText: PRODUTO_CHA });
  await expect(cha).toContainText("Parecido — confira");
  await expect(cha).toContainText("CHA MATE NATURAL 250G");

  // (c) não existe no Gaveta → produto novo. O nome dele é CAMPO (vai para o
  // cadastro), então o item é localizado pelo selo e conferido pelo valor.
  const biscoito = linhas.filter({ hasText: "Produto novo" });
  await expect(biscoito).toHaveCount(1);
  await expect(biscoito.getByLabel("Nome do produto")).toHaveValue(
    "BISCOITO AGUA E SAL 200G",
  );

  // NADA foi gravado só por importar — a conferência é obrigatória.
  const { count } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("access_key", chaveXml);
  expect(count ?? 0).toBe(0);
});

test("2. depois de conferir, a nota importada é lançada como 'xml'", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.xml",
    mimeType: "text/xml",
    buffer: Buffer.from(xmlDaNota(chaveXml), "utf8"),
  });
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(3);

  // O produto novo ainda precisa do preço de venda — o arquivo não traz.
  const biscoito = page
    .locator(`${sel.itens} li`)
    .filter({ hasText: "Produto novo" });
  await expect(
    page.getByRole("button", { name: "Conferir e lançar nota" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "preço de venda" }),
  ).toBeVisible();

  await biscoito.getByLabel("Preço de venda").fill("450");

  // O nome vindo da nota costuma vir abreviado ou cortado — e é ele que vai
  // para o cadastro, então precisa ser editável (pedido do dono).
  await expect(biscoito.getByLabel("Nome do produto")).toHaveValue(
    "BISCOITO AGUA E SAL 200G",
  );
  await biscoito.getByLabel("Nome do produto").fill("Biscoito água e sal 200g");
  // Depois de editar, a tela mostra o que a nota dizia, para comparar.
  await expect(biscoito).toContainText("Na nota está:");
  await expect(biscoito).toContainText("BISCOITO AGUA E SAL 200G");

  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("2 produtos serão atualizados");
  await expect(dialogo).toContainText("1 produto novo será criado");
  await expect(dialogo).toContainText("R$ 73,00");
  await dialogo
    .getByRole("button", { name: "Lançar nota", exact: true })
    .click();

  await expect(page).toHaveURL(/\/estoque\/compras\/[0-9a-f-]+/);

  // ── Conferência NO BANCO (docs/09 §1) ─────────────────────────────
  const { data: nota } = await app
    .from("purchases")
    .select("id, supplier_name, source, total, issued_on")
    .eq("access_key", chaveXml)
    .single();
  // A ORIGEM fica registrada: dá para saber que veio de arquivo.
  expect(nota?.source).toBe("xml");
  expect(nota?.supplier_name).toBe(FORNECEDOR_XML);
  expect(Number(nota?.total)).toBe(73);
  expect(nota?.issued_on).toBe(hojeISO());

  // O item reconhecido pelo código somou no produto certo, com o custo da nota.
  const { data: cafe } = await app
    .from("products")
    .select("stock_quantity, cost_price")
    .eq("id", cafeId)
    .single();
  expect(Number((cafe as { stock_quantity: number }).stock_quantity)).toBe(9);
  expect(Number((cafe as { cost_price: number }).cost_price)).toBe(9.5);

  // O sugerido caiu no produto existente (não criou um duplicado).
  const { data: chas } = await app
    .from("products")
    .select("id, stock_quantity, cost_price")
    .eq("name", PRODUTO_CHA);
  expect(chas ?? []).toHaveLength(1);
  expect(Number((chas ?? [])[0]?.stock_quantity as unknown as number)).toBe(3);
  expect(Number((chas ?? [])[0]?.cost_price as unknown as number)).toBe(5);

  // O novo foi cadastrado com o NOME CORRIGIDO e o preço informado.
  const { data: novo } = await app
    .from("products")
    .select("price, cost_price, stock_quantity")
    .eq("name", "Biscoito água e sal 200g")
    .single();
  expect(Number((novo as { price: number }).price)).toBe(4.5);
  expect(Number((novo as { cost_price: number }).cost_price)).toBe(2);
  expect(Number((novo as { stock_quantity: number }).stock_quantity)).toBe(10);

  // O histórico da nota guarda a descrição EDITADA do item — é o que a
  // pessoa confirmou. O produto criado leva o mesmo nome.
  const { data: itensDaNota } = await app
    .from("purchase_items")
    .select("description_snapshot")
    .eq("purchase_id", (nota as { id: string }).id);
  const descricoes = ((itensDaNota ?? []) as { description_snapshot: string }[])
    .map((i) => i.description_snapshot)
    .sort();
  expect(descricoes).toContain("Biscoito água e sal 200g");

  // E o gasto automático saiu com o total da nota.
  const { data: gasto } = await app
    .from("expenses")
    .select("amount, category")
    .eq("description", `Compra de mercadorias — ${FORNECEDOR_XML}`)
    .single();
  expect(gasto?.category).toBe("insumos");
  expect(Number(gasto?.amount)).toBe(73);
});

test("3. PDF do DANFE também preenche a tela e registra a origem", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-arquivo").setInputFiles({
    name: "danfe.pdf",
    mimeType: "application/pdf",
    buffer: pdfDaNota(chavePdf),
  });

  await expect(page.locator("#supplier")).toHaveValue(FORNECEDOR_PDF);
  await expect(page.locator("#accessKey")).toHaveValue(chavePdf);
  await expect(page.locator("#issuedOn")).toHaveValue(hojeISO());

  const linha = page.locator(`${sel.itens} li`);
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText(PRODUTO_CAFE);
  await expect(linha).toContainText("Já cadastrado");
  await expect(linha.getByLabel("Quantidade")).toHaveValue("2");
  await expect(linha.getByLabel("Custo por unidade")).toHaveValue(
    /^R\$\s11,00$/,
  );

  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lançar nota", exact: true })
    .click();
  await expect(page).toHaveURL(/\/estoque\/compras\/[0-9a-f-]+/);

  const { data: nota } = await app
    .from("purchases")
    .select("source, supplier_name, total")
    .eq("access_key", chavePdf)
    .single();
  expect(nota?.source).toBe("pdf");
  expect(nota?.supplier_name).toBe(FORNECEDOR_PDF);
  expect(Number(nota?.total)).toBe(22);

  // 9 do lançamento anterior + 2 desta nota.
  const { data: cafe } = await app
    .from("products")
    .select("stock_quantity, cost_price")
    .eq("id", cafeId)
    .single();
  expect(Number((cafe as { stock_quantity: number }).stock_quantity)).toBe(11);
  expect(Number((cafe as { cost_price: number }).cost_price)).toBe(11);
});

test("4. arquivo que não serve é recusado com explicação simples", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");

  // Imagem: não tem texto nenhum para ler.
  await page.locator("#nota-arquivo").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "PDF da nota" }),
  ).toBeVisible();

  // XML que não é NF-e.
  await page.locator("#nota-arquivo").setInputFiles({
    name: "qualquer.xml",
    mimeType: "text/xml",
    buffer: Buffer.from("<?xml version='1.0'?><lista><a>1</a></lista>", "utf8"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "nota fiscal eletrônica" }),
  ).toBeVisible();

  // A tela continua utilizável: nada de item fantasma.
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(0);
});

test("5. importar não apaga o que já foi digitado sem perguntar", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");

  // Digita um item à mão…
  await page.locator("#nota-query").fill(CODIGO_CAFE);
  await page.locator("#nota-query").press("Enter");
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(1);

  // …e então importa um arquivo com outros itens.
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.xml",
    mimeType: "text/xml",
    buffer: Buffer.from(xmlDaNota(chaveFicticia()), "utf8"),
  });

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Substituir os itens desta tela?");

  // Escolhendo manter, o item digitado continua lá.
  await dialogo.getByRole("button", { name: "Manter o que digitei" }).click();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(1);

  // Importando de novo e aceitando, os itens do arquivo tomam o lugar.
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.xml",
    mimeType: "text/xml",
    buffer: Buffer.from(xmlDaNota(chaveFicticia()), "utf8"),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Usar os itens do arquivo" })
    .click();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(3);
});

/**
 * Via de OCR (fase G2c). A "foto" é gerada aqui: o navegador desenha um
 * bloco de nota e tira um screenshot. Assim o teste exercita o caminho real
 * (imagem → OCR no servidor → tela de conferência) sem colocar nota de
 * ninguém num repositório público.
 */
async function fotoDeUmaNota(page: import("@playwright/test").Page) {
  await page.setContent(`
    <body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif">
      <div style="padding:28px;color:#000">
        <div style="font-size:26px;font-weight:bold">DADOS DOS PRODUTOS</div>
        <div style="font-size:24px;margin-top:18px">ARROZ BRANCO TIPO UM</div>
        <div style="font-size:24px;margin-top:14px">FEIJAO CARIOCA COMUM</div>
        <div style="font-size:24px;margin-top:14px">ACUCAR REFINADO UNIAO</div>
      </div>
    </body>`);
  return page.screenshot({ clip: { x: 0, y: 0, width: 700, height: 260 } });
}

test("6. foto da nota traz só os nomes, e a tela avisa a limitação", async ({
  page,
}) => {
  // O OCR é bem mais lento que ler um XML, e na primeira vez ainda baixa o
  // modelo de idioma.
  test.setTimeout(180_000);

  const foto = await fotoDeUmaNota(page);

  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.png",
    mimeType: "image/png",
    buffer: foto,
  });

  // O aviso é obrigatório: esta via é a mais fraca das três.
  await expect(page.getByText("Li a foto, mas só os nomes")).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByText("números não saem confiáveis")).toBeVisible();
  await expect(
    page.getByText("Sempre que tiver o", { exact: false }),
  ).toBeVisible();

  const linhas = page.locator(`${sel.itens} li`);
  await expect(linhas).toHaveCount(3);

  // Os nomes vieram; quantidade e custo NÃO — ficam para a pessoa preencher.
  await expect(linhas.first().getByLabel("Nome do produto")).toHaveValue(
    /ARROZ/,
  );
  await expect(linhas.first().getByLabel("Custo por unidade")).toHaveValue("");
  await expect(linhas.first().getByLabel("Quantidade")).toHaveValue("1");

  // E nada foi gravado: continua sendo a pessoa que confirma.
  const { count } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("source", "foto");
  expect(count ?? 0).toBe(0);
});
