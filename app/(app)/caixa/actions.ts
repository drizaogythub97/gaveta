"use server";

import { createClient } from "@/lib/supabase/server";
import type { Product, SaleItemInput } from "@/lib/types/db";

const SEARCH_LIMIT = 8;

const PRODUCT_COLUMNS =
  "id, user_id, name, barcode, price, track_stock, stock_quantity, created_at, updated_at";

export async function searchProductsByName(query: string): Promise<Product[]> {
  const term = query.trim();
  if (term.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("name", `%${term}%`)
    .order("name", { ascending: true })
    .limit(SEARCH_LIMIT);

  return (data ?? []) as Product[];
}

export async function findProductByCode(
  query: string,
): Promise<Product | null> {
  const term = query.trim();
  if (term.length === 0) return null;

  const supabase = await createClient();

  const { data: byBarcode } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("barcode", term)
    .maybeSingle();

  if (byBarcode) return byBarcode as Product;

  const { data: byName } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("name", term)
    .limit(1)
    .maybeSingle();

  return (byName ?? null) as Product | null;
}

export type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "vale";

const VALID_METHODS: ReadonlySet<PaymentMethod> = new Set([
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "vale",
]);

export type RegisterSaleResult =
  | { ok: true; saleId: string }
  | { ok: false; error: string };

export async function registerSale(
  items: SaleItemInput[],
  paymentMethod: PaymentMethod,
): Promise<RegisterSaleResult> {
  if (items.length === 0) {
    return { ok: false, error: "Adicione ao menos um item à venda." };
  }
  for (const item of items) {
    if (!item.name || item.quantity <= 0 || item.unit_price < 0) {
      return { ok: false, error: "Há itens inválidos na venda." };
    }
  }
  if (!VALID_METHODS.has(paymentMethod)) {
    return { ok: false, error: "Forma de pagamento inválida." };
  }

  const supabase = await createClient();
  const payload = items.map((it) => ({
    product_id: it.product_id,
    name: it.name,
    unit_price: it.unit_price,
    quantity: it.quantity,
  }));

  const { data, error } = await supabase.rpc("register_sale", {
    items: payload,
    payment_method: paymentMethod,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message?.toLowerCase().includes("não autenticado") ||
        error.code === "PGRST301"
          ? "Sessão expirada. Entre novamente."
          : "Não foi possível registrar a venda. Tente novamente.",
    };
  }

  return { ok: true, saleId: data as string };
}
