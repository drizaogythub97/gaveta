"use server";

import {
  PARCELAS_MAX,
  PARCELAS_MIN,
  parcelasValidas,
} from "@/lib/caixa/parcelas";
import { escaparLike } from "@/lib/db/like";
import { createClient } from "@/lib/supabase/server";
import type { Product, SaleItemInput } from "@/lib/types/db";

const SEARCH_LIMIT = 8;

const PRODUCT_COLUMNS =
  "id, user_id, name, price, cost_price, track_stock, stock_quantity, created_at, updated_at";

export async function searchProductsByName(query: string): Promise<Product[]> {
  const term = query.trim();
  if (term.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("name", `%${escaparLike(term)}%`)
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

  const { data: barcodeMatch } = await supabase
    .from("product_barcodes")
    .select("product_id")
    .eq("barcode", term)
    .maybeSingle();

  if (barcodeMatch?.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", barcodeMatch.product_id)
      .maybeSingle();
    if (product) return product as Product;
  }

  const { data: byName } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("name", escaparLike(term))
    .limit(1)
    .maybeSingle();

  return (byName ?? null) as Product | null;
}

export type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito_avista"
  | "credito_parcelado"
  | "vale";

const VALID_METHODS: ReadonlySet<PaymentMethod> = new Set([
  "dinheiro",
  "pix",
  "debito",
  "credito_avista",
  "credito_parcelado",
  "vale",
]);

export type RegisterSaleResult =
  | { ok: true; saleId: string }
  | { ok: false; error: string };

export async function loadPaymentFees() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("preferences_fees")
    .select(
      "pix_pct, debito_pct, credito_avista_pct, credito_parcelado_base_pct, credito_parcelado_por_parcela_pct, vale_pct",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  return data;
}

/**
 * Registra a venda.
 *
 * NÃO recebe mais a taxa: ela era calculada no navegador e gravada como
 * veio, e o Fechamento desconta essa taxa do LUCRO — bastava a tela estar
 * desatualizada para o lucro sair errado sem nada denunciar. Agora quem
 * calcula é a `register_sale`, lendo `preferences_fees` do próprio usuário
 * (migration 0023). A tela segue mostrando a estimativa; ela só não manda
 * mais no que fica gravado. Ver o achado C de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 */
export async function registerSale(
  items: SaleItemInput[],
  paymentMethod: PaymentMethod,
  installments: number | null,
  discountAmount: number,
): Promise<RegisterSaleResult> {
  if (items.length === 0) {
    return { ok: false, error: "Adicione ao menos um item à venda." };
  }
  let subtotal = 0;
  for (const item of items) {
    if (!item.name || item.quantity <= 0 || item.unit_price < 0) {
      return { ok: false, error: "Há itens inválidos na venda." };
    }
    subtotal += Math.round(item.unit_price * item.quantity * 100) / 100;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  if (!VALID_METHODS.has(paymentMethod)) {
    return { ok: false, error: "Forma de pagamento inválida." };
  }
  if (
    paymentMethod === "credito_parcelado" &&
    !parcelasValidas(installments)
  ) {
    return {
      ok: false,
      error: `Número de parcelas inválido (${PARCELAS_MIN} a ${PARCELAS_MAX}).`,
    };
  }

  const discount = Math.max(0, Math.round((discountAmount || 0) * 100) / 100);
  if (!Number.isFinite(discount) || discount > subtotal) {
    return { ok: false, error: "Desconto inválido." };
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
    installments:
      paymentMethod === "credito_parcelado" ? installments : null,
    discount_amount: discount,
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
