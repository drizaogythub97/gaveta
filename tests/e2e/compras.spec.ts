import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import {
  chaveFicticia,
  hojeISO,
  loadUsers,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Validação da fase G2a — entrada por nota (protocolo docs/09 §1).
 *
 * Roda logado como usuário DESCARTÁVEL (criado no auth.setup, apagado no
 * teardown) e confere na UI **e no banco** que os quatro efeitos da nota
 * aconteceram: estoque somado, último custo aplicado, movimento 'purchase'
 * e gasto em 'insumos'. Fecha com a regressão do PDV (à vista e a prazo).
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PRODUTO = "Arroz Teste 5kg";
const CODIGO = "7891000000015";
const FORNECEDOR = "Atacado E2E";

let user: TestUser;
let app: SupabaseClient;
let produtoId: string;
let chaveDaNota: string;

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);
  chaveDaNota = chaveFicticia();

  // Produto que já existe no Gaveta: estoque 10, custo antigo R$ 4,00.
  const { data, error } = await app
    .from("products")
    .insert({
      user_id: user.id,
      name: PRODUTO,
      price: 28,
      cost_price: 4,
      track_stock: true,
      stock_quantity: 10,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  produtoId = (data as { id: string }).id;

  const { error: barcodeError } = await app
    .from("product_barcodes")
    .insert({ product_id: produtoId, user_id: user.id, barcode: CODIGO });
  expect(barcodeError).toBeNull();
});

/** Blocos da tela de entrada por nota. */
const sel = {
  dados: 'section[aria-labelledby="nota-dados"]',
  adicionar: 'section[aria-labelledby="nota-adicionar"]',
  itens: 'section[aria-labelledby="nota-itens"]',
};

test("1. Estoque leva à entrada por nota", async ({ page }) => {
  await page.goto("/estoque");
  await page.getByRole("link", { name: "Entrada por nota" }).click();

  await expect(page).toHaveURL(/\/estoque\/compras\/nova/);
  await expect(
    page.getByRole("heading", { name: "Entrada por nota" }),
  ).toBeVisible();
  // A data já vem preenchida com hoje — um campo a menos para o usuário.
  await expect(page.locator("#issuedOn")).toHaveValue(hojeISO());
});

test("3. item existente entra pelo nome e pelo código, já com o último custo", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");

  // ── Busca por NOME ────────────────────────────────────────────────
  await page.locator("#nota-query").fill("Arroz Teste");
  await page
    .locator(sel.adicionar)
    .getByRole("button", { name: new RegExp(PRODUTO) })
    .click();

  const linha = page.locator(`${sel.itens} li`).filter({ hasText: PRODUTO });
  await expect(linha).toHaveCount(1);
  await expect(linha.getByText("Já cadastrado")).toBeVisible();
  // Último custo conhecido do produto (R$ 4,00) já vem preenchido.
  await expect(linha.getByLabel("Custo por unidade")).toHaveValue(
    /^R\$\s4,00$/,
  );

  // ── Busca por CÓDIGO DE BARRAS (Enter, como o leitor USB faz) ──────
  await page.locator("#nota-query").fill(CODIGO);
  await page.locator("#nota-query").press("Enter");
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(2);
  await expect(
    page.locator(`${sel.itens} li`).nth(1).getByLabel("Custo por unidade"),
  ).toHaveValue(/^R\$\s4,00$/);
});

test("4. produto novo exige preço de venda", async ({ page }) => {
  await page.goto("/estoque/compras/nova");

  await page.locator("#nota-query").fill("Produto Inexistente E2E");
  await page.locator("#nota-query").press("Enter");

  const bloco = page.locator(sel.adicionar);
  await expect(bloco.getByText("Produto ainda não cadastrado")).toBeVisible();
  await expect(bloco.locator("#novo-nome")).toHaveValue(
    "Produto Inexistente E2E",
  );

  await bloco.getByLabel("Quantidade que chegou").fill("5");
  await bloco.getByLabel("Custo por unidade").fill("700");
  // Sem preço de venda: o item não entra e a tela explica o porquê.
  await bloco.getByRole("button", { name: "Adicionar à nota" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "por quanto você vai vender" }),
  ).toBeVisible();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(0);

  // Com o preço informado, entra normalmente.
  await bloco.getByLabel("Preço de venda").fill("1200");
  await bloco.getByRole("button", { name: "Adicionar à nota" }).click();
  const linha = page.locator(`${sel.itens} li`);
  await expect(linha).toHaveCount(1);
  await expect(linha.getByText("Produto novo")).toBeVisible();
});

test("5. quantidade inválida é recusada, custo nunca fica negativo e o total recalcula", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-query").fill(CODIGO);
  await page.locator("#nota-query").press("Enter");

  const linha = page.locator(`${sel.itens} li`).first();
  await linha.getByLabel("Quantidade").fill("3");
  await linha.getByLabel("Custo por unidade").fill("550");

  // 3 × R$ 5,50 = R$ 16,50, na linha e no total da nota.
  await expect(linha.getByText("R$ 16,50")).toBeVisible();
  await expect(page.getByText("Total da nota")).toBeVisible();
  await expect(page.locator("body")).toContainText("R$ 16,50");

  // Recalcula ao mudar a quantidade.
  await linha.getByLabel("Quantidade").fill("2");
  await expect(linha.getByText("R$ 11,00")).toBeVisible();

  // O campo de custo só aceita dígitos — não há como digitar negativo.
  await linha.getByLabel("Custo por unidade").fill("-5");
  await expect(linha.getByLabel("Custo por unidade")).toHaveValue(
    /^R\$\s0,05$/,
  );
  await linha.getByLabel("Custo por unidade").fill("550");

  // Quantidade zero e negativa não passam da conferência.
  for (const valor of ["0", "-1"]) {
    await linha.getByLabel("Quantidade").fill(valor);
    await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Confira a quantidade" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("2. data no futuro e chave incompleta são recusadas pelo servidor", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-query").fill(CODIGO);
  await page.locator("#nota-query").press("Enter");
  const linha = page.locator(`${sel.itens} li`).first();
  await linha.getByLabel("Quantidade").fill("1");
  await linha.getByLabel("Custo por unidade").fill("500");

  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator("#issuedOn").fill(amanha);
  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  await page.getByRole("button", { name: "Lançar nota", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "não pode ser no futuro" }),
  ).toBeVisible();

  // Data de volta ao normal, agora com uma chave incompleta.
  await page.locator("#issuedOn").fill(hojeISO());
  await page.locator("#accessKey").fill("123456");
  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  await page.getByRole("button", { name: "Lançar nota", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "44 números" }),
  ).toBeVisible();

  // Nenhuma das tentativas gravou nota nenhuma.
  const { count } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true });
  expect(count ?? 0).toBe(0);
});

test("6+7. resumo confere e a nota grava os quatro efeitos no banco", async ({
  page,
}) => {
  await page.goto("/estoque/compras/nova");

  await page.locator("#supplier").fill(FORNECEDOR);
  await page.locator("#issuedOn").fill(hojeISO());
  // Chave copiada da nota, com espaços a cada 4 dígitos (como o portal mostra).
  await page
    .locator("#accessKey")
    .fill(chaveDaNota.replace(/(.{4})/g, "$1 ").trim());

  // Item já cadastrado: 6 unidades a R$ 5,50 = R$ 33,00.
  await page.locator("#nota-query").fill(CODIGO);
  await page.locator("#nota-query").press("Enter");
  const existente = page.locator(`${sel.itens} li`).first();
  await existente.getByLabel("Quantidade").fill("6");
  await existente.getByLabel("Custo por unidade").fill("550");

  // Item novo: 12 unidades a R$ 7,25 = R$ 87,00.
  await page.locator("#nota-query").fill("Feijão Teste 1kg");
  await page.locator("#nota-query").press("Enter");
  const bloco = page.locator(sel.adicionar);
  await bloco.getByLabel("Quantidade que chegou").fill("12");
  await bloco.getByLabel("Custo por unidade").fill("725");
  await bloco.getByLabel("Preço de venda").fill("1190");
  await bloco.getByRole("button", { name: "Adicionar à nota" }).click();
  await expect(page.locator(`${sel.itens} li`)).toHaveCount(2);

  // Antes de confirmar, NADA foi gravado.
  const { count: antes } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true });
  expect(antes ?? 0).toBe(0);

  // ── Resumo da confirmação ─────────────────────────────────────────
  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("1 produto será atualizado");
  await expect(dialogo).toContainText("1 produto novo será criado");
  await expect(dialogo).toContainText("R$ 120,00");

  await dialogo.getByRole("button", { name: "Lançar nota", exact: true }).click();
  await expect(page).toHaveURL(/\/estoque\/compras\/[0-9a-f-]+/);
  await expect(page.getByText("O estoque já entrou")).toBeVisible();

  // ── Conferência NO BANCO (docs/09 §1) ─────────────────────────────
  const { data: nota } = await app
    .from("purchases")
    .select("id, supplier_name, access_key, issued_on, total, source")
    .eq("access_key", chaveDaNota)
    .single();
  expect(nota?.supplier_name).toBe(FORNECEDOR);
  expect(Number(nota?.total)).toBe(120);
  expect(nota?.issued_on).toBe(hojeISO());
  expect(nota?.source).toBe("manual");

  // (a) estoque somado e (b) último custo aplicado no produto existente
  const { data: produto } = await app
    .from("products")
    .select("stock_quantity, cost_price")
    .eq("id", produtoId)
    .single();
  expect(Number((produto as { stock_quantity: number }).stock_quantity)).toBe(16);
  expect(Number((produto as { cost_price: number }).cost_price)).toBe(5.5);

  // produto novo criado com custo, preço e estoque da nota
  const { data: novo } = await app
    .from("products")
    .select("id, price, cost_price, stock_quantity, track_stock")
    .eq("name", "Feijão Teste 1kg")
    .single();
  const criado = novo as {
    id: string;
    price: number;
    cost_price: number;
    stock_quantity: number;
  };
  expect(Number(criado.price)).toBe(11.9);
  expect(Number(criado.cost_price)).toBe(7.25);
  expect(Number(criado.stock_quantity)).toBe(12);

  // (c) movimento de estoque do tipo 'purchase'
  const { data: movs } = await app
    .from("stock_movements")
    .select("type, quantity, note")
    .eq("type", "purchase");
  const movimentos = (movs ?? []) as {
    quantity: number;
    note: string | null;
  }[];
  expect(movimentos).toHaveLength(2);
  expect(movimentos.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual(
    [6, 12],
  );
  expect(movimentos[0]?.note).toContain(FORNECEDOR);

  // (d) gasto automático em 'insumos', com o total, na data da compra
  const { data: gastos } = await app
    .from("expenses")
    .select("category, amount, incurred_on, description")
    .eq("category", "insumos");
  const despesas = (gastos ?? []) as {
    amount: number;
    incurred_on: string;
    description: string;
  }[];
  expect(despesas).toHaveLength(1);
  expect(Number(despesas[0]?.amount)).toBe(120);
  expect(despesas[0]?.incurred_on).toBe(hojeISO());
  expect(despesas[0]?.description).toContain(FORNECEDOR);
});

test("8. a mesma nota não entra duas vezes", async ({ page }) => {
  await page.goto("/estoque/compras/nova");
  await page.locator("#supplier").fill(FORNECEDOR);
  await page
    .locator("#accessKey")
    .fill(chaveDaNota.replace(/(.{4})/g, "$1 ").trim());
  await page.locator("#nota-query").fill(CODIGO);
  await page.locator("#nota-query").press("Enter");
  const linha = page.locator(`${sel.itens} li`).first();
  await linha.getByLabel("Quantidade").fill("1");
  await linha.getByLabel("Custo por unidade").fill("600");

  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  await page.getByRole("button", { name: "Lançar nota", exact: true }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "já foi lançada" }),
  ).toBeVisible();

  // Continua existindo UMA nota com aquela chave, e o estoque não mexeu.
  const { count } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("access_key", chaveDaNota);
  expect(count).toBe(1);
  const { data: produto } = await app
    .from("products")
    .select("stock_quantity")
    .eq("id", produtoId)
    .single();
  expect(Number((produto as { stock_quantity: number }).stock_quantity)).toBe(16);
});

test("9. histórico lista a nota e o detalhe mostra os itens", async ({
  page,
}) => {
  await page.goto("/estoque/compras");
  const item = page.getByRole("link", { name: new RegExp(FORNECEDOR) });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("2 itens");
  await expect(item).toContainText("R$ 120,00");

  await item.click();
  await expect(page).toHaveURL(/\/estoque\/compras\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: FORNECEDOR })).toBeVisible();
  await expect(page.getByText(PRODUTO)).toBeVisible();
  await expect(page.getByText("Feijão Teste 1kg")).toBeVisible();
  await expect(page.getByText("R$ 33,00")).toBeVisible();
  await expect(page.getByText("R$ 87,00")).toBeVisible();
  await expect(page.getByText(chaveDaNota)).toBeVisible();
});

test("10. regressão: venda à vista no PDV continua normal depois da compra", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(PRODUTO);
  await page
    .getByRole("listbox", { name: "Sugestões de produtos" })
    .getByRole("button", { name: new RegExp(PRODUTO) })
    .click();

  await page.locator("#payment-method").selectOption("dinheiro");
  await page.locator("#paid-amount").fill("5000");
  await page.getByRole("button", { name: "Registrar venda" }).click();

  // Convite de impressão aparece: recusa e segue.
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/Venda registrada/i)).toBeVisible();

  // Banco: venda à vista, estoque baixado e — ponte com a G1 — o custo da
  // nota virou snapshot no item vendido.
  const { data: venda } = await app
    .from("sales")
    .select("id, total, payment_method, fiado_venda_id")
    .eq("payment_method", "dinheiro")
    .single();
  const vendaId = (venda as { id: string }).id;
  expect(Number((venda as { total: number }).total)).toBe(28);

  const { data: itens } = await app
    .from("sale_items")
    .select("quantity, unit_cost")
    .eq("sale_id", vendaId);
  expect(Number((itens ?? [])[0]?.unit_cost)).toBe(5.5);

  const { data: produto } = await app
    .from("products")
    .select("stock_quantity")
    .eq("id", produtoId)
    .single();
  expect(Number((produto as { stock_quantity: number }).stock_quantity)).toBe(15);
});

test("10b. regressão: venda a prazo (FiadoApp) continua normal depois da compra", async ({
  page,
}) => {
  // A ponte é opt-in: liga como o dono faria em /ecossistema.
  await app.from("ecossistema_prefs").upsert({
    user_id: user.id,
    fiado_pdv_ativo: true,
    updated_at: new Date().toISOString(),
  });

  await page.goto("/caixa");
  await page.locator("#pos-query").fill(PRODUTO);
  await page
    .getByRole("listbox", { name: "Sugestões de produtos" })
    .getByRole("button", { name: new RegExp(PRODUTO) })
    .click();

  await page.locator("#payment-method").selectOption("fiado");
  await page.getByRole("button", { name: "Cadastrar Novo Cliente" }).click();
  await page.locator("#fiado-novo-nome").fill("Cliente E2E");
  await page.getByRole("button", { name: "Salvar" }).click();

  await page.getByRole("button", { name: "Registrar a prazo" }).click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/registrada no FiadoApp/i)).toBeVisible();

  // Banco: venda 'fiado' fora do caixa, ligada ao a-receber do FiadoApp,
  // com estoque baixado e o custo da nota no snapshot.
  const { data: venda } = await app
    .from("sales")
    .select("id, total, payment_method, fiado_venda_id, cash_session_id")
    .eq("payment_method", "fiado")
    .single();
  const fiado = venda as {
    id: string;
    total: number;
    fiado_venda_id: string | null;
    cash_session_id: string | null;
  };
  expect(Number(fiado.total)).toBe(28);
  expect(fiado.fiado_venda_id).toBeTruthy();
  expect(fiado.cash_session_id).toBeNull();

  const { data: aReceber } = await app
    .from("fiado_vendas")
    .select("valor_total, origem, status")
    .eq("id", fiado.fiado_venda_id)
    .single();
  expect(Number(aReceber?.valor_total)).toBe(28);
  expect(aReceber?.origem).toBe("gaveta");

  const { data: itens } = await app
    .from("sale_items")
    .select("unit_cost")
    .eq("sale_id", fiado.id);
  expect(Number((itens ?? [])[0]?.unit_cost)).toBe(5.5);

  const { data: produto } = await app
    .from("products")
    .select("stock_quantity")
    .eq("id", produtoId)
    .single();
  expect(Number((produto as { stock_quantity: number }).stock_quantity)).toBe(14);
});
