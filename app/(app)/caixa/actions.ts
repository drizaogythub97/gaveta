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

  // Eram três consultas em série (código → produto → nome). Agora são duas,
  // disparadas JUNTAS: o produto pelo código vem numa consulta só, com o
  // `!inner` filtrando pela tabela de códigos, e a busca pelo nome exato
  // corre em paralelo. A preferência continua a mesma: o código manda.
  const [{ data: porCodigo }, { data: porNome }] = await Promise.all([
    supabase
      .from("products")
      .select(`${PRODUCT_COLUMNS}, product_barcodes!inner(barcode)`)
      .eq("product_barcodes.barcode", term)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .ilike("name", escaparLike(term))
      .limit(1)
      .maybeSingle(),
  ]);

  if (porCodigo) {
    // O embed só serviu para filtrar; o que sai daqui é o produto de sempre.
    const { product_barcodes: _codigos, ...product } = porCodigo as Product & {
      product_barcodes: unknown;
    };
    void _codigos;
    return product as Product;
  }

  return (porNome ?? null) as Product | null;
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
  | {
      ok: true;
      saleId: string;
      /**
       * A taxa REALMENTE gravada, lida de volta do banco.
       *
       * A tela calcula uma estimativa para mostrar antes de fechar a venda,
       * mas quem grava é a `register_sale` (achado C). Se o cadastro de
       * Preferências mudou depois que a tela carregou, os dois números
       * discordam — e o que o comprovante mostra tem de ser o que ficou
       * gravado, não o palpite da tela.
       */
      feeAmount: number;
      /** Total gravado, pelo mesmo motivo. */
      total: number;
    }
  | { ok: false; error: string };

/**
 * Taxas cadastradas em Preferências.
 *
 * Não pede o usuário ao Auth: a RLS de `preferences_fees` já devolve só a
 * linha do dono da sessão (`auth.uid() = user_id`), então o `getUser()` que
 * havia aqui era uma viagem de rede a mais só para repetir um filtro que o
 * banco impõe de qualquer jeito. Sem sessão, a consulta devolve nada e o
 * caixa cai nas taxas padrão — o proxy já barrou a página antes disso.
 */
export async function loadPaymentFees() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("preferences_fees")
    .select(
      "pix_pct, debito_pct, credito_avista_pct, credito_parcelado_base_pct, credito_parcelado_por_parcela_pct, vale_pct",
    )
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
  if (paymentMethod === "credito_parcelado" && !parcelasValidas(installments)) {
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
    installments: paymentMethod === "credito_parcelado" ? installments : null,
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

  const saleId = data as string;

  // Lê de volta o que ficou gravado: é barato (busca pela chave primária) e
  // é o que permite a tela dizer a verdade sobre a taxa.
  const { data: gravada } = await supabase
    .from("sales")
    .select("total, fee_amount")
    .eq("id", saleId)
    .maybeSingle();
  const venda = gravada as { total: number; fee_amount: number } | null;

  return {
    ok: true,
    saleId,
    feeAmount: Number(venda?.fee_amount ?? 0),
    total: Number(venda?.total ?? 0),
  };
}
