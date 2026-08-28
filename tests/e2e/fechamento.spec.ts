import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Validação da fase G3 — Fechamento Lucro × Custo (protocolo docs/09).
 *
 * Roda logado como usuário DESCARTÁVEL. O usuário já tem vendas de outros
 * arquivos do suíte, então cada teste mede a VARIAÇÃO causada pela venda que
 * ele mesmo registra — assim a asserção não depende do que veio antes.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PRODUTO_COM_CUSTO = "Sabao em po Fechamento";
const PRODUTO_SEM_CUSTO = "Bolo caseiro Fechamento";

let user: TestUser;
let app: SupabaseClient;

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { error } = await app.from("products").insert([
    {
      user_id: user.id,
      name: PRODUTO_COM_CUSTO,
      price: 25,
      cost_price: 10,
      track_stock: true,
      stock_quantity: 50,
    },
    {
      user_id: user.id,
      name: PRODUTO_SEM_CUSTO,
      price: 30,
      cost_price: null,
      track_stock: true,
      stock_quantity: 50,
    },
  ]);
  expect(error).toBeNull();
});

/** "R$ 1.234,56" → 1234.56 (o Intl usa espaço não separável antes do número). */
function lerBRL(texto: string): number {
  const limpo = texto
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const valor = Number(limpo);
  expect(Number.isFinite(valor)).toBe(true);
  return valor;
}

/**
 * Os três números do fechamento, lidos da tela pelo nome da região. Sem
 * nenhuma venda no período a tela mostra o estado vazio — que para efeito de
 * comparação vale zero em tudo.
 */
async function lerFechamento(page: Page) {
  await page.goto("/financeiro?tab=fechamento&period=today");

  const cabecalhoCusto = page.getByRole("heading", {
    name: /Guardar para repor a mercadoria/,
  });
  const vazio = page.getByText(/Nada entrou neste período/);
  await expect(cabecalhoCusto.or(vazio).first()).toBeVisible();

  if ((await cabecalhoCusto.count()) === 0) {
    return { entrou: 0, custo: 0, lucro: 0 };
  }

  const valorDaRegiao = async (nome: RegExp) => {
    const regiao = page.getByRole("region", { name: nome });
    const texto = await regiao.locator("p").first().innerText();
    return lerBRL(texto);
  };

  return {
    entrou: await valorDaRegiao(/^Entrou/),
    custo: await valorDaRegiao(/Guardar para repor a mercadoria/),
    lucro: await valorDaRegiao(/^Lucro$/),
  };
}

/** Vende um produto pela frente de caixa, como o dono faria. */
async function venderNoCaixa(
  page: Page,
  produto: string,
  formaPagamento: "dinheiro" | "credito_avista",
) {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(produto);
  await page
    .getByRole("listbox", { name: "Sugestões de produtos" })
    .getByRole("button", { name: new RegExp(produto) })
    .click();

  await page.locator("#payment-method").selectOption(formaPagamento);
  if (formaPagamento === "dinheiro") {
    await page.locator("#paid-amount").fill("10000");
  }
  await page.getByRole("button", { name: "Registrar venda" }).click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/Venda registrada/i)).toBeVisible();
}

test("1. o Financeiro tem a aba Fechamento, e período sem venda é explicado", async ({
  page,
}) => {
  await page.goto("/financeiro");
  await page.getByRole("link", { name: "Fechamento" }).click();
  await expect(page).toHaveURL(/tab=fechamento/);

  // Período antigo, garantidamente sem venda: a tela não pode ficar em
  // branco nem mostrar "R$ 0,00" solto — explica o que vai aparecer ali.
  await page.goto(
    "/financeiro?tab=fechamento&period=custom&from=2020-01-01&to=2020-01-02",
  );
  await expect(page.getByText(/Nada entrou neste período/)).toBeVisible();
  await expect(
    page.getByText("quanto guardar para repor a mercadoria"),
  ).toBeVisible();
});

test("1b. com venda no período, a tela explica o split sem jargão", async ({
  page,
}) => {
  await venderNoCaixa(page, PRODUTO_COM_CUSTO, "dinheiro");
  await page.goto("/financeiro?tab=fechamento&period=today");

  await expect(
    page.getByRole("heading", { name: /Guardar para repor a mercadoria/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Lucro$/ })).toBeVisible();
  // Linguagem do dono, sem jargão contábil.
  await expect(page.getByText("Separe este valor para")).toBeVisible();
  await expect(page.getByText(/CMV|margem bruta/i)).toHaveCount(0);
});

test("2. uma venda à vista soma custo e lucro na medida certa", async ({
  page,
}) => {
  const antes = await lerFechamento(page);

  // Produto de R$ 25,00 que custou R$ 10,00.
  await venderNoCaixa(page, PRODUTO_COM_CUSTO, "dinheiro");

  const depois = await lerFechamento(page);
  expect(depois.entrou - antes.entrou).toBeCloseTo(25, 2);
  expect(depois.custo - antes.custo).toBeCloseTo(10, 2);
  expect(depois.lucro - antes.lucro).toBeCloseTo(15, 2);

  // E a conta mostrada fecha: entrou − taxas − custo = lucro.
  const { data } = await app
    .rpc("lucro_custo_summary", {
      p_from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      p_to: new Date().toISOString(),
      p_methods: null,
    })
    .maybeSingle();
  const linha = data as { taxas: number };
  expect(depois.entrou - Number(linha.taxas) - depois.custo).toBeCloseTo(
    depois.lucro,
    2,
  );
});

test("3. produto sem custo avisa que o lucro está por cima e oferece o atalho", async ({
  page,
}) => {
  await venderNoCaixa(page, PRODUTO_SEM_CUSTO, "dinheiro");

  await page.goto("/financeiro?tab=fechamento&period=today");
  await expect(
    page.getByRole("heading", { name: "O lucro acima está por cima" }),
  ).toBeVisible();

  const linha = page
    .getByRole("listitem")
    .filter({ hasText: PRODUTO_SEM_CUSTO });
  await expect(linha).toContainText("R$ 30,00");

  // O atalho leva direto ao cadastro do produto, para informar o custo.
  await linha.getByRole("link", { name: "Informar custo" }).click();
  await expect(page).toHaveURL(/\/produtos\/[0-9a-f-]+\/editar/);
  await expect(page.locator("#costPrice")).toBeVisible();
});

test("4. venda a prazo NÃO entra no dia da venda — só na quitação", async ({
  page,
}) => {
  // A ponte é opt-in: liga como o dono faria em /ecossistema.
  await app.from("ecossistema_prefs").upsert({
    user_id: user.id,
    fiado_pdv_ativo: true,
    updated_at: new Date().toISOString(),
  });

  const antes = await lerFechamento(page);

  await page.goto("/caixa");
  await page.locator("#pos-query").fill(PRODUTO_COM_CUSTO);
  await page
    .getByRole("listbox", { name: "Sugestões de produtos" })
    .getByRole("button", { name: new RegExp(PRODUTO_COM_CUSTO) })
    .click();
  await page.locator("#payment-method").selectOption("fiado");
  await page.getByRole("button", { name: "Cadastrar Novo Cliente" }).click();
  await page.locator("#fiado-novo-nome").fill("Cliente Fechamento");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("button", { name: "Registrar a prazo" }).click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(page.getByText(/registrada no FiadoApp/i)).toBeVisible();

  // Vendeu e baixou estoque, mas nada entrou no caixa: o fechamento não mexe.
  const depoisDaVenda = await lerFechamento(page);
  expect(depoisDaVenda.entrou).toBeCloseTo(antes.entrou, 2);
  expect(depoisDaVenda.custo).toBeCloseTo(antes.custo, 2);
  expect(depoisDaVenda.lucro).toBeCloseTo(antes.lucro, 2);

  // Agora o cliente paga METADE: entra a metade do valor e do custo.
  const { data: venda } = await app
    .from("fiado_vendas")
    .select("id, valor_total")
    .eq("origem", "gaveta")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const fiado = venda as { id: string; valor_total: number };
  const metade = Math.round((Number(fiado.valor_total) / 2) * 100) / 100;

  const { error } = await app.from("fiado_pagamentos").insert({
    user_id: user.id,
    venda_id: fiado.id,
    valor_pago: metade,
    pago_em: new Date().toISOString(),
  });
  expect(error).toBeNull();

  const depoisDoPagamento = await lerFechamento(page);
  expect(depoisDoPagamento.entrou - antes.entrou).toBeCloseTo(metade, 2);
  // Custo rateado: metade dos R$ 10,00 do produto vendido.
  expect(depoisDoPagamento.custo - antes.custo).toBeCloseTo(5, 2);
  expect(depoisDoPagamento.lucro - antes.lucro).toBeCloseTo(metade - 5, 2);

  // A tela separa o que veio do caixa do que veio de venda a prazo.
  await expect(page.getByText("recebido de vendas a prazo")).toBeVisible();
});

test("5. o fechamento de caixa leva ao fechamento do dia", async ({ page }) => {
  await page.goto("/caixa/sessao");
  await page.getByRole("link", { name: "Ver o fechamento do dia" }).click();

  await expect(page).toHaveURL(/tab=fechamento/);
  await expect(
    page.getByRole("heading", { name: /Guardar para repor a mercadoria/ }),
  ).toBeVisible();
});
