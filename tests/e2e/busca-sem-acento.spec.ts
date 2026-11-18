import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Busca por pedaço do nome, sem acento e em qualquer ordem — pelo caminho
 * de verdade: tela, Server Action, PostgREST e Postgres.
 *
 * Antes, as buscas faziam `ilike '%termo%'` com o texto inteiro: "racao" não
 * achava "Ração", "maria souza" não achava "Maria Aparecida Souza", e o
 * cliente do fiado só era achado pelo NOME — nem sobrenome, nem referência.
 * No caixa, o Enter com o nome sem acento caía em "produto não encontrado"
 * e oferecia cadastrar de novo o que já existia. Ver `lib/db/busca.ts`.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

// "Zumbrava" não existe em nenhum outro teste: isola esta spec dos produtos
// e clientes que as outras deixam na mesma conta descartável.
const RACAO = "Ração Zumbrava Filhotes 15kg";
const PAO = "ZUMBRAVA PÃO DE AÇÚCAR";
const CAFE = "Café Zumbrava Torrado";

const JOSEFA = {
  nome: "Joséfa",
  sobrenome: "Zumbrava da Conceição",
  referencia: "Fifi do Mercado",
};
const MARIA = {
  nome: "Maria Aparecida",
  sobrenome: "Zumbrava",
  referencia: "Cida",
};

let user: TestUser;
let app: SupabaseClient;
const produtos: string[] = [];
const clientes: string[] = [];

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("products")
    .insert(
      [RACAO, PAO, CAFE].map((name) => ({
        user_id: user.id,
        name,
        price: 10,
        track_stock: true,
        stock_quantity: 5,
      })),
    )
    .select("id");
  expect(error).toBeNull();
  produtos.push(...(data ?? []).map((p: { id: string }) => p.id));

  // A ponte com o FiadoApp é opt-in: liga como o dono faria em /ecossistema.
  await app.from("ecossistema_prefs").upsert({
    user_id: user.id,
    fiado_pdv_ativo: true,
    updated_at: new Date().toISOString(),
  });
  const { data: cli, error: cliError } = await app
    .from("fiado_clientes")
    .insert([JOSEFA, MARIA].map((c) => ({ user_id: user.id, ...c })))
    .select("id");
  expect(cliError).toBeNull();
  clientes.push(...(cli ?? []).map((c: { id: string }) => c.id));
});

test.afterAll(async () => {
  if (produtos.length > 0) await app.from("products").delete().in("id", produtos);
  if (clientes.length > 0) {
    await app.from("fiado_clientes").delete().in("id", clientes);
  }
});

const sugestoes = (page: Page) =>
  page.getByRole("listbox", { name: "Sugestões de produtos" });

test("caixa: acha o produto sem acento e com as palavras fora de ordem", async ({
  page,
}) => {
  await page.goto("/caixa");

  await page.locator("#pos-query").fill("zumbrava racao");
  await expect(sugestoes(page).getByRole("button")).toHaveCount(1);
  await expect(sugestoes(page)).toContainText(RACAO);

  // Maiúsculo no cadastro, minúsculo e sem acento na busca, ordem trocada.
  await page.locator("#pos-query").fill("acucar zumbrava");
  await expect(sugestoes(page).getByRole("button")).toHaveCount(1);
  await expect(sugestoes(page)).toContainText(PAO);
});

test("caixa: o Enter acha o nome exato mesmo digitado sem acento", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill("cafe zumbrava torrado");
  await page.locator("#pos-query").press("Enter");

  // Antes: "produto não encontrado", oferecendo cadastrar o que já existia.
  await expect(
    page.getByRole("button", { name: `Remover ${CAFE}` }),
  ).toBeVisible();
});

test("Produtos: a busca acha sem acento e com as palavras fora de ordem", async ({
  page,
}) => {
  await page.goto("/produtos");
  await page.getByLabel("Buscar por nome").fill("filhotes zumbrava racao");

  const cartoes = page.getByRole("link", { name: /^Editar / });
  await expect(cartoes).toHaveCount(1);
  await expect(cartoes.first()).toHaveAttribute("aria-label", `Editar ${RACAO}`);
});

test("Estoque: a busca por nome também ignora o acento", async ({ page }) => {
  await page.goto("/estoque");
  await page.getByLabel("Nome ou código").fill("pao zumbrava");

  const linhas = page.getByRole("listitem").filter({ hasText: "ZUMBRAVA" });
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toContainText(PAO);
});

test("caixa, venda a prazo: acha o cliente pelo sobrenome, pelo apelido e sem acento", async ({
  page,
}) => {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill("zumbrava racao");
  await sugestoes(page).getByRole("button", { name: new RegExp(RACAO) }).click();
  await page.locator("#payment-method").selectOption("fiado");

  const busca = page.getByLabel("Buscar cliente do FiadoApp");
  const josefa = page.getByRole("button", { name: /^Joséfa Zumbrava/ });
  const maria = page.getByRole("button", { name: /^Maria Aparecida Zumbrava/ });

  // Pelo sobrenome, sem o acento e sem a cedilha do cadastro.
  await busca.fill("conceicao");
  await expect(josefa).toBeVisible();
  await expect(maria).toHaveCount(0);

  // Pela referência (o apelido) — antes, só o nome entrava na busca.
  await busca.fill("fifi");
  await expect(josefa).toBeVisible();
  await busca.fill("cida");
  await expect(maria).toBeVisible();
  await expect(josefa).toHaveCount(0);

  // Sobrenome antes do nome, e o nome digitado sem acento.
  await busca.fill("zumbrava maria");
  await expect(maria).toBeVisible();
  await expect(josefa).toHaveCount(0);
  await busca.fill("josefa");
  await expect(josefa).toBeVisible();
});
