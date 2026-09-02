import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Listagem de produtos: paginação de 15 e categorias (migration 0019).
 *
 * A listagem trazia o catálogo INTEIRO com os códigos de barras aninhados —
 * com centenas de itens ficava pesada no celular. Aqui se garante que o
 * corte acontece (15 por página, contagem exata do banco) e que a troca de
 * página e o filtro por categoria NÃO recarregam o documento.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

const PREFIXO = "Zproduto e2e";
const CATEGORIA = "Zcategoria e2e";
const CATEGORIA_A = "Zcategoria e2e A";
const CATEGORIA_B = "Zcategoria e2e B";
const QUANTOS = 17; // mais de uma página

let user: TestUser;
let app: SupabaseClient;
let idsCriados: string[] = [];
let alvoId = "";
let alvoNome = "";

test.beforeAll(async () => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);

  const { data, error } = await app
    .from("products")
    .insert(
      Array.from({ length: QUANTOS }, (_, i) => ({
        user_id: user.id,
        name: `${PREFIXO} ${String(i + 1).padStart(2, "0")}`,
        price: 5 + i,
        track_stock: false,
        stock_quantity: null,
      })),
    )
    .select("id, name");
  expect(error).toBeNull();
  const criados = (data ?? []) as { id: string; name: string }[];
  idsCriados = criados.map((p) => p.id);
  // Os 17 nascem no mesmo instante, então a ordem da listagem entre eles não
  // é garantida: o teste vai direto pelo id em vez de caçar um nome na
  // primeira página.
  alvoId = criados[0].id;
  alvoNome = criados[0].name;
});

test.afterAll(async () => {
  // Limpa o que este arquivo criou: os outros testes contam o catálogo.
  if (idsCriados.length > 0) {
    await app.from("products").delete().in("id", idsCriados);
  }
  await app
    .from("product_tags")
    .delete()
    .in("name", [CATEGORIA, CATEGORIA_A, CATEGORIA_B]);
});

/** Marca o documento: se a página recarregar, a marca se perde. */
async function marcarDocumento(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __semRecarregar?: boolean }).__semRecarregar = true;
  });
}

async function documentoIntacto(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __semRecarregar?: boolean }).__semRecarregar ===
      true,
  );
}

const cartoes = (page: Page) =>
  page.getByRole("link", { name: /^Editar / });

test("mostra 15 produtos por página", async ({ page }) => {
  await page.goto("/produtos");

  await expect(cartoes(page)).toHaveCount(15);
  await expect(
    page.getByRole("navigation", { name: "Páginas da lista de produtos" }),
  ).toBeVisible();
});

test("a próxima página troca só a lista, sem recarregar", async ({ page }) => {
  await page.goto("/produtos");
  const primeiro = await cartoes(page).first().getAttribute("aria-label");

  await marcarDocumento(page);
  await page.getByRole("link", { name: "Próxima →" }).click();

  await expect(page).toHaveURL(/page=2/);
  await expect(cartoes(page).first()).not.toHaveAttribute(
    "aria-label",
    primeiro ?? "",
  );
  expect(await documentoIntacto(page)).toBe(true);
});

test("categoria criada no cadastro filtra a listagem", async ({ page }) => {
  // 1. Cadastra a categoria pelo próprio formulário do produto.
  await page.goto(`/produtos/${alvoId}/editar`);
  await expect(
    page.getByRole("heading", { name: "Editar produto" }),
  ).toBeVisible();

  await page.getByLabel("Criar categoria").fill(CATEGORIA);
  // exact: "Adicionar outro código" (dos códigos de barras) também casaria.
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  // A etiqueta aparece antes de salvar, com o botão de tirar do lado.
  await expect(
    page.getByRole("button", { name: `Remover categoria ${CATEGORIA}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForURL(/\/produtos$/);

  // 2. A categoria vira chip no produto e opção dentro da lista suspensa.
  const abrirFiltro = page.getByRole("button", {
    name: /^Filtrar por categoria:/,
  });
  await abrirFiltro.click();
  const opcao = page.getByRole("checkbox", { name: CATEGORIA });
  await expect(opcao).toBeVisible();

  // 3. Marcar deixa só o produto categorizado — e não recarrega a página.
  await marcarDocumento(page);
  await opcao.click();
  // O painel fica aberto de propósito (quase sempre se marca mais de uma);
  // aqui ele sai da frente para a lista poder ser conferida.
  await page.keyboard.press("Escape");

  await expect(cartoes(page)).toHaveCount(1);
  await expect(cartoes(page).first()).toHaveAttribute(
    "aria-label",
    `Editar ${alvoNome}`,
  );
  expect(await documentoIntacto(page)).toBe(true);

  // 4. E o vínculo existe mesmo no banco, não só na tela.
  const { data } = await app
    .from("product_tags")
    .select("id, product_tag_links(product_id)")
    .eq("name", CATEGORIA);
  const tag = (data ?? [])[0] as
    | { id: string; product_tag_links: { product_id: string }[] }
    | undefined;
  expect(tag?.product_tag_links).toHaveLength(1);
});

test("produto cadastrado pela entrada por nota nasce com a categoria", async ({
  page,
}) => {
  const nome = "Zproduto da nota e2e";
  const bloco = 'section[aria-labelledby="nota-adicionar"]';

  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-query").fill(nome);
  await page.locator("#nota-query").press("Enter");

  const novo = page.locator(bloco);
  await expect(novo.getByText("Produto ainda não cadastrado")).toBeVisible();
  await novo.getByLabel("Quantidade que chegou").fill("3");
  await novo.getByLabel("Custo por unidade").fill("500");
  await novo.getByLabel("Preço de venda").fill("900");

  // A categoria criada no teste anterior já aparece para marcar — é a mesma
  // lista do cadastro de produto.
  await novo.getByRole("button", { name: CATEGORIA }).click();
  await novo.getByRole("button", { name: "Adicionar à nota" }).click();

  await page.getByRole("button", { name: "Conferir e lançar nota" }).click();
  // exact: "Conferir e lançar nota" também casaria.
  await page.getByRole("button", { name: "Lançar nota", exact: true }).click();
  await page.waitForURL(/\/estoque\/compras\/[0-9a-f-]+\?lancada=1/, {
    timeout: 30_000,
  });

  // O produto nasceu já vinculado à categoria — conferido no banco.
  const { data } = await app
    .from("products")
    .select("id, name, product_tag_links(tag_id, product_tags(name))")
    .eq("name", nome)
    .maybeSingle();
  const criado = data as {
    id: string;
    product_tag_links: { product_tags: { name: string } | null }[];
  } | null;
  expect(criado).not.toBeNull();
  expect(
    (criado?.product_tag_links ?? []).map((l) => l.product_tags?.name),
  ).toEqual([CATEGORIA]);

  idsCriados.push(criado!.id);
});


test("busca por nome filtra conforme se digita, sem recarregar", async ({
  page,
}) => {
  await page.goto("/produtos");
  await expect(cartoes(page)).toHaveCount(15);

  await marcarDocumento(page);
  // Um nome que só existe em um dos 17 semeados.
  await page.getByLabel("Buscar por nome").fill(`${PREFIXO} 03`);

  await expect(cartoes(page)).toHaveCount(1);
  await expect(cartoes(page).first()).toHaveAttribute(
    "aria-label",
    `Editar ${PREFIXO} 03`,
  );
  // O termo vai para a URL (endereço compartilhável) e a página volta à 1.
  await expect(page).toHaveURL(/[?&]q=/);
  expect(await documentoIntacto(page)).toBe(true);

  // Limpar devolve a listagem inteira e tira o termo da URL.
  await page.getByRole("button", { name: "Limpar a busca" }).click();
  await expect(cartoes(page)).toHaveCount(15);
  await expect(page).not.toHaveURL(/[?&]q=/);
  expect(await documentoIntacto(page)).toBe(true);
});

test("busca sem resultado explica e oferece limpar", async ({ page }) => {
  await page.goto("/produtos");
  await page
    .getByLabel("Buscar por nome")
    .fill("Zzz produto que nao existe e2e");

  await expect(cartoes(page)).toHaveCount(0);
  await expect(
    page.getByText(/Nenhum produto com .* no nome/),
  ).toBeVisible();

  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(cartoes(page)).toHaveCount(15);
});

test("duas categorias marcadas somam (OU), não interseccionam", async ({
  page,
}) => {
  // Duas categorias, cada uma em um produto diferente.
  const { data: tagsData, error: erroTags } = await app
    .from("product_tags")
    .insert([
      { user_id: user.id, name: CATEGORIA_A },
      { user_id: user.id, name: CATEGORIA_B },
    ])
    .select("id, name");
  expect(erroTags).toBeNull();
  const tags = (tagsData ?? []) as { id: string; name: string }[];
  const idA = tags.find((t) => t.name === CATEGORIA_A)!.id;
  const idB = tags.find((t) => t.name === CATEGORIA_B)!.id;

  await app.from("product_tag_links").insert([
    { user_id: user.id, product_id: idsCriados[0], tag_id: idA },
    { user_id: user.id, product_id: idsCriados[1], tag_id: idB },
  ]);

  await page.goto("/produtos");
  const abrir = page.getByRole("button", { name: /^Filtrar por categoria:/ });
  await abrir.click();

  // Só a A: um produto.
  await marcarDocumento(page);
  await page.getByRole("checkbox", { name: CATEGORIA_A }).click();
  await expect(cartoes(page)).toHaveCount(1);

  // A e B juntas: DOIS produtos — se fosse "E", daria zero, porque nenhum
  // produto tem as duas categorias. É esta a diferença que o teste guarda.
  await page.getByRole("checkbox", { name: CATEGORIA_B }).click();
  await expect(cartoes(page)).toHaveCount(2);
  expect(await documentoIntacto(page)).toBe(true);

  // As duas viajam na URL, repetindo o parâmetro.
  const url = new URL(page.url());
  expect(url.searchParams.getAll("tag").sort()).toEqual([idA, idB].sort());

  // "Limpar" tira as duas de uma vez.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Limpar" }).click();
  await expect(cartoes(page)).toHaveCount(15);
});

test("busca e categoria se combinam (E entre os dois filtros)", async ({
  page,
}) => {
  const { data } = await app
    .from("product_tags")
    .select("id")
    .eq("name", CATEGORIA_A)
    .maybeSingle();
  const idA = (data as { id: string } | null)?.id;
  expect(idA).toBeTruthy();

  // A categoria A tem o produto 01. Buscar por um nome que não é o dele,
  // dentro dessa categoria, tem de dar zero.
  await page.goto(`/produtos?tag=${idA}&q=${encodeURIComponent(`${PREFIXO} 05`)}`);
  await expect(cartoes(page)).toHaveCount(0);

  // E buscar pelo nome certo, na mesma categoria, devolve o produto.
  await page.goto(`/produtos?tag=${idA}&q=${encodeURIComponent(alvoNome)}`);
  await expect(cartoes(page)).toHaveCount(1);
});
