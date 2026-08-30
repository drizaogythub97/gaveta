import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, userClient } from "./helpers";
import type { TestUser } from "./helpers";

/**
 * Categorias de produto (migration 0019).
 *
 * O que estes testes trancam:
 *   1. `aplicar_tags_no_produto` deixa o produto com EXATAMENTE as
 *      categorias informadas, criando na hora as que vêm só pelo nome;
 *   2. produto de outro dono não aceita categoria, e id de tag alheia é
 *      ignorado — a RLS continua sendo a fronteira;
 *   3. o nome é único por dono ignorando caixa (não nascem "Bebidas" e
 *      "bebidas" lado a lado).
 *
 * **Dois usuários para o arquivo inteiro**: cada `createTestUser` é um
 * cadastro + login no Supabase Auth, que tem limite de taxa por IP.
 */

let dono: TestUser;
let intruso: TestUser;
let app: ReturnType<typeof userClient>;
let appIntruso: ReturnType<typeof userClient>;

async function criarProduto(nome: string): Promise<string> {
  const { data, error } = await app
    .from("products")
    .insert({
      user_id: dono.id,
      name: nome,
      price: 10,
      track_stock: true,
      stock_quantity: 5,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
  return (data as { id: string }).id;
}

async function tagsDoProduto(productId: string): Promise<string[]> {
  const { data } = await app
    .from("product_tag_links")
    .select("product_tags(name)")
    .eq("product_id", productId);
  // O embed do PostgREST vem tipado como lista; na prática é 1 para 1.
  return ((data ?? []) as unknown as {
    product_tags: { name: string } | null;
  }[])
    .map((l) => l.product_tags?.name ?? "")
    .filter((n) => n !== "")
    .sort();
}

beforeAll(async () => {
  dono = await createTestUser("tags-dono");
  intruso = await createTestUser("tags-intruso");
  app = userClient(dono.accessToken);
  appIntruso = userClient(intruso.accessToken);
}, 60_000);

afterAll(async () => {
  await deleteTestUser(dono);
  await deleteTestUser(intruso);
});

describe("RPC aplicar_tags_no_produto", () => {
  it("cria a categoria digitada na hora e vincula ao produto", async () => {
    const produto = await criarProduto("Café");
    const { error } = await app.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [],
      p_new_tags: ["Bebidas", "Mercearia"],
    });
    expect(error).toBeNull();
    expect(await tagsDoProduto(produto)).toEqual(["Bebidas", "Mercearia"]);
  });

  it("reaproveita a categoria existente em vez de duplicar por caixa", async () => {
    const produto = await criarProduto("Chá");
    // "bebidas" minúsculo tem de casar com a "Bebidas" criada acima.
    const { error } = await app.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [],
      p_new_tags: ["bebidas"],
    });
    expect(error).toBeNull();

    const { data } = await app
      .from("product_tags")
      .select("id, name")
      .ilike("name", "bebidas");
    // Uma só, com o nome original — a segunda digitação não criou nada.
    expect(data).toHaveLength(1);
    expect((data as { name: string }[])[0].name).toBe("Bebidas");
  });

  it("deixa o produto com exatamente as categorias informadas", async () => {
    const produto = await criarProduto("Suco");
    await app.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [],
      p_new_tags: ["Bebidas", "Gelados"],
    });
    expect(await tagsDoProduto(produto)).toEqual(["Bebidas", "Gelados"]);

    // Segunda chamada com só uma: a outra tem de sair.
    const { data: tags } = await app
      .from("product_tags")
      .select("id, name")
      .eq("name", "Gelados");
    const geladosId = (tags as { id: string }[])[0].id;

    await app.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [geladosId],
      p_new_tags: [],
    });
    expect(await tagsDoProduto(produto)).toEqual(["Gelados"]);
  });

  it("recusa produto que não é do usuário", async () => {
    const produto = await criarProduto("Biscoito");
    const { error } = await appIntruso.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [],
      p_new_tags: ["Roubada"],
    });
    // A RLS esconde o produto, então a função não o encontra.
    expect(error).not.toBeNull();
    expect(await tagsDoProduto(produto)).toEqual([]);
  });

  it("ignora id de categoria alheia em vez de vinculá-la", async () => {
    const { data: minhas } = await app
      .from("product_tags")
      .select("id")
      .limit(1);
    const tagDoDono = (minhas as { id: string }[])[0].id;

    const { data: produtoIntruso } = await appIntruso
      .from("products")
      .insert({
        user_id: intruso.id,
        name: "Produto do intruso",
        price: 5,
        track_stock: false,
        stock_quantity: null,
      })
      .select("id")
      .single();
    const idIntruso = (produtoIntruso as { id: string }).id;

    const { error } = await appIntruso.rpc("aplicar_tags_no_produto", {
      p_product: idIntruso,
      p_tags: [tagDoDono],
      p_new_tags: [],
    });
    expect(error).toBeNull();

    // Nenhum vínculo criado: a tag do dono não existe para o intruso.
    const { data: links } = await appIntruso
      .from("product_tag_links")
      .select("tag_id")
      .eq("product_id", idIntruso);
    expect(links ?? []).toHaveLength(0);
  });

  it("recusa nome de categoria longo demais", async () => {
    const produto = await criarProduto("Bolacha");
    const { error } = await app.rpc("aplicar_tags_no_produto", {
      p_product: produto,
      p_tags: [],
      p_new_tags: ["x".repeat(31)],
    });
    expect(error).not.toBeNull();
  });
});

describe("RLS — categorias não vazam entre usuários", () => {
  it("o intruso não lê as categorias nem os vínculos do dono", async () => {
    const { data: tags } = await appIntruso.from("product_tags").select("id");
    expect(tags ?? []).toHaveLength(0);

    const { data: links } = await appIntruso
      .from("product_tag_links")
      .select("tag_id");
    expect(links ?? []).toHaveLength(0);
  });

  it("o intruso não cria categoria em nome do dono", async () => {
    const { error } = await appIntruso
      .from("product_tags")
      .insert({ user_id: dono.id, name: "Falsa" });
    expect(error).not.toBeNull();
  });
});
