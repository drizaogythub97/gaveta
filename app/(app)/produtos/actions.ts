"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ZodIssue } from "zod";

import { createClient } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validations/products";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      "name" | "barcodes" | "price" | "trackStock" | "stockQuantity",
      string
    >
  >;
  values?: {
    name?: string;
    barcodes?: string[];
    price?: string;
    trackStock?: "true" | "false";
    stockQuantity?: string;
  };
};

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    barcodes: formData.getAll("barcodes").map((v) => String(v)),
    price: String(formData.get("price") ?? ""),
    trackStock: String(formData.get("trackStock") ?? ""),
    stockQuantity: String(formData.get("stockQuantity") ?? ""),
  };
}

function rawValues(raw: ReturnType<typeof readForm>) {
  return {
    name: raw.name,
    barcodes: raw.barcodes,
    price: raw.price,
    trackStock:
      raw.trackStock === "true" || raw.trackStock === "false"
        ? (raw.trackStock as "true" | "false")
        : undefined,
    stockQuantity: raw.stockQuantity,
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
      key === "trackStock" ||
      key === "stockQuantity"
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
  return "Não foi possível salvar. Tente novamente.";
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

  revalidatePath("/produtos");
  redirect("/produtos");
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

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${id}/editar`);
  redirect("/produtos");
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
