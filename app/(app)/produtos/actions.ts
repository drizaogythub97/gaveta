"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ZodIssue } from "zod";

import { escaparLike } from "@/lib/db/like";
import { createClient } from "@/lib/supabase/server";
import type { ProductTag } from "@/lib/types/db";
import { productSchema } from "@/lib/validations/products";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "name"
      | "barcodes"
      | "price"
      | "costPrice"
      | "trackStock"
      | "stockQuantity"
      | "tags",
      string
    >
  >;
  values?: {
    name?: string;
    barcodes?: string[];
    price?: string;
    costPrice?: string;
    trackStock?: "true" | "false";
    stockQuantity?: string;
    tagIds?: string[];
  };
};

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    barcodes: formData.getAll("barcodes").map((v) => String(v)),
    price: String(formData.get("price") ?? ""),
    costPrice: String(formData.get("costPrice") ?? ""),
    trackStock: String(formData.get("trackStock") ?? ""),
    stockQuantity: String(formData.get("stockQuantity") ?? ""),
    tagIds: formData.getAll("tagIds").map((v) => String(v)),
    newTags: formData.getAll("newTags").map((v) => String(v)),
  };
}

function rawValues(raw: ReturnType<typeof readForm>) {
  return {
    name: raw.name,
    barcodes: raw.barcodes,
    price: raw.price,
    costPrice: raw.costPrice,
    trackStock:
      raw.trackStock === "true" || raw.trackStock === "false"
        ? (raw.trackStock as "true" | "false")
        : undefined,
    stockQuantity: raw.stockQuantity,
    tagIds: raw.tagIds,
  };
}

function collectFieldErrors(issues: ZodIssue[]): ProductFormState["fieldErrors"] {
  const fieldErrors: ProductFormState["fieldErrors"] = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (
      key === "name" ||
      key === "barcodes" ||
      key === "price" ||
      key === "costPrice" ||
      key === "trackStock" ||
      key === "stockQuantity" ||
      key === "tags"
    ) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function dbErrorToPortuguese(message: string | undefined): string {
  if (!message) return "Não foi possível salvar. Tente novamente.";
  if (/uniq_product_barcodes_user_barcode|duplicate key/i.test(message)) {
    return "Um dos códigos de barras já está em uso em outro produto.";
  }
  if (/products_stock_qty_when_tracked/i.test(message)) {
    return "Informe a quantidade quando o estoque é controlado.";
  }
  if (/products_cost_price_non_negative/i.test(message)) {
    return "O preço de custo não pode ser negativo.";
  }
  return "Não foi possível salvar. Tente novamente.";
}

/**
 * Deixa o produto com exatamente as categorias escolhidas.
 *
 * Vai por RPC (`aplicar_tags_no_produto`, migration 0019) e não por inserts
 * soltos: criar a categoria nova e vinculá-la precisa acontecer junto, senão
 * um erro no meio deixa tag órfã ou produto com metade das categorias.
 */
async function syncTags(
  productId: string,
  tagIds: string[],
  newTags: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aplicar_tags_no_produto", {
    p_product: productId,
    p_tags: tagIds,
    p_new_tags: newTags,
  });
  if (error) {
    return { error: "Não foi possível salvar as categorias. Tente novamente." };
  }
  return {};
}

async function syncBarcodes(
  productId: string,
  userId: string,
  barcodes: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("product_barcodes")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", userId);
  if (delError) return { error: dbErrorToPortuguese(delError.message) };

  if (barcodes.length === 0) return {};

  const { error: insError } = await supabase.from("product_barcodes").insert(
    barcodes.map((barcode) => ({
      product_id: productId,
      user_id: userId,
      barcode,
    })),
  );
  if (insError) return { error: dbErrorToPortuguese(insError.message) };
  return {};
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const raw = readForm(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: collectFieldErrors(parsed.error.issues),
      values: rawValues(raw),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessão expirada. Entre novamente." };
  }

  const tracks = parsed.data.trackStock === "true";
  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      price: parsed.data.price,
      cost_price: parsed.data.costPrice,
      track_stock: tracks,
      stock_quantity: tracks ? (parsed.data.stockQuantity ?? 0) : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      error: dbErrorToPortuguese(error?.message),
      values: rawValues(raw),
    };
  }

  const syncResult = await syncBarcodes(
    inserted.id,
    user.id,
    parsed.data.barcodes,
  );
  if (syncResult.error) {
    // Rollback: deleta o produto recém-criado para evitar entrada órfã.
    await supabase
      .from("products")
      .delete()
      .eq("id", inserted.id)
      .eq("user_id", user.id);
    return { error: syncResult.error, values: rawValues(raw) };
  }

  const tagResult = await syncTags(
    inserted.id,
    parsed.data.tagIds,
    parsed.data.newTags,
  );
  if (tagResult.error) {
    await supabase
      .from("products")
      .delete()
      .eq("id", inserted.id)
      .eq("user_id", user.id);
    return { error: tagResult.error, values: rawValues(raw) };
  }

  revalidatePath("/produtos");
  // A confirmação viaja na URL e quem a mostra é a tela de DESTINO. Um aviso
  // montado aqui morreria junto com o formulário que está saindo — era por
  // isso que salvar um produto devolvia a lista em silêncio.
  redirect(
    `/produtos?salvo=novo&nome=${encodeURIComponent(parsed.data.name)}`,
  );
}

export async function updateProduct(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const raw = readForm(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: collectFieldErrors(parsed.error.issues),
      values: rawValues(raw),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessão expirada. Entre novamente." };
  }

  const tracks = parsed.data.trackStock === "true";
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      price: parsed.data.price,
      cost_price: parsed.data.costPrice,
      track_stock: tracks,
      stock_quantity: tracks ? (parsed.data.stockQuantity ?? 0) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return {
      error: dbErrorToPortuguese(error.message),
      values: rawValues(raw),
    };
  }

  const syncResult = await syncBarcodes(id, user.id, parsed.data.barcodes);
  if (syncResult.error) {
    return { error: syncResult.error, values: rawValues(raw) };
  }

  const tagResult = await syncTags(
    id,
    parsed.data.tagIds,
    parsed.data.newTags,
  );
  if (tagResult.error) {
    return { error: tagResult.error, values: rawValues(raw) };
  }

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${id}/editar`);
  redirect(
    `/produtos?salvo=editado&nome=${encodeURIComponent(parsed.data.name)}`,
  );
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase.from("products").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/produtos");
}

/**
 * Cria (ou reaproveita) uma categoria na hora, fora do salvamento de um
 * produto.
 *
 * Existe para a entrada por nota: quem lança uma nota cadastra vários
 * produtos em sequência, e a categoria digitada no primeiro tem de estar
 * disponível para marcar no segundo. Antes, ela só nascia quando a nota
 * inteira era salva — e cada item repetia o mesmo nome sem saber do outro.
 *
 * Reaproveita a existente comparando sem diferenciar caixa, que é o mesmo
 * critério do índice único do banco (`lower(btrim(name))`), para a pessoa
 * não acabar com "Bebidas" e "bebidas".
 */
export async function criarTag(
  nomeBruto: string,
): Promise<{ tag?: ProductTag; error?: string }> {
  const nome = String(nomeBruto ?? "").trim();
  if (nome === "") return { error: "Escreva o nome da categoria." };
  if (nome.length > 30) {
    return { error: "Categoria muito longa (máx. 30 caracteres)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre de novo." };

  // `ilike` com o termo exato (e curingas escapados) é igualdade sem
  // diferenciar caixa — o mesmo critério do índice único da tabela.
  const procurar = async () => {
    const { data } = await supabase
      .from("product_tags")
      .select("id, name")
      .ilike("name", escaparLike(nome))
      .limit(1);
    return ((data ?? []) as ProductTag[])[0];
  };

  const existente = await procurar();
  if (existente) return { tag: existente };

  const { data, error } = await supabase
    .from("product_tags")
    .insert({ user_id: user.id, name: nome })
    .select("id, name")
    .single();

  if (error) {
    // 23505: outra aba (ou um clique duplo) criou a mesma categoria entre a
    // busca e o insert. Não é erro para quem está usando — é a categoria que
    // ela queria, já existindo.
    if (error.code === "23505") {
      const criadaAgora = await procurar();
      if (criadaAgora) return { tag: criadaAgora };
    }
    return { error: "Não foi possível criar a categoria. Tente de novo." };
  }

  revalidatePath("/produtos");
  return { tag: data as ProductTag };
}
