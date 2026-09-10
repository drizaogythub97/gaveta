import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * O curinga do LIKE não escapa da busca do caixa.
 *
 * `%` e `_` são curingas do SQL. Sem escapar, digitar `50%` na tela mais
 * usada do sistema pedia "qualquer coisa" e devolvia o catálogo inteiro —
 * quem procurava o produto com 50% no nome recebia tudo menos uma resposta
 * útil. Não é falha de segurança (o PostgREST parametriza o valor), é
 * resultado errado na tela. Ver o achado E de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const COM_CURINGA = "Zcuringa 50% desconto";
const COMUM_A = "Zcuringa arroz comum";
const COMUM_B = "Zcuringa feijao comum";
const COM_SUBLINHADO = "Zcuringa cafe_500";

let user: TestUser;
let app: SupabaseClient;
const criados: string[] = [];

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  for (const name of [COM_CURINGA, COMUM_A, COMUM_B, COM_SUBLINHADO]) {
    const { data, error } = await app
      .from("products")
      .insert({
        user_id: user.id,
        name,
        price: 10,
        track_stock: true,
        stock_quantity: 5,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    criados.push((data as { id: string }).id);
  }
});

test.afterAll(async () => {
  if (criados.length > 0) await app.from("products").delete().in("id", criados);
});

async function buscar(page: import("@playwright/test").Page, termo: string) {
  await page.goto("/caixa");
  await page.locator("#pos-query").fill(termo);
  await page.locator("#pos-query").press("Enter");
  return page.getByRole("listbox", { name: "Sugestões de produtos" });
}

test("buscar '50%' acha o produto certo, não o catálogo inteiro", async ({
  page,
}) => {
  const lista = await buscar(page, "50%");

  // Antes: o % virava "qualquer coisa" e vinham todos os produtos do
  // usuário. Agora casa só o que tem 50% no nome, de verdade.
  await expect(lista.getByRole("button")).toHaveCount(1);
  await expect(lista).toContainText(COM_CURINGA);
  await expect(lista).not.toContainText(COMUM_A);
  await expect(lista).not.toContainText(COMUM_B);
});

test("o '_' também deixou de casar com qualquer caractere", async ({
  page,
}) => {
  const lista = await buscar(page, "cafe_500");

  await expect(lista.getByRole("button")).toHaveCount(1);
  await expect(lista).toContainText(COM_SUBLINHADO);
});

test("um '%' sozinho não devolve tudo — devolve o que tem '%' no nome", async ({
  page,
}) => {
  const lista = await buscar(page, "%");

  // O caso extremo do achado: sem escape, este termo pedia a tabela inteira.
  await expect(lista.getByRole("button")).toHaveCount(1);
  await expect(lista).toContainText(COM_CURINGA);
});

test("busca normal continua achando pelo pedaço do nome", async ({ page }) => {
  const lista = await buscar(page, "Zcuringa");

  // O escape não pode ter quebrado a busca comum: os quatro estão aí.
  await expect(lista.getByRole("button")).toHaveCount(4);
});
