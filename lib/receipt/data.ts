import { createClient } from "@/lib/supabase/server";
import type {
  ReceiptBrand,
  ReceiptData,
  ReceiptPaper,
  ReceiptPrefs,
} from "@/lib/receipt/types";
import type { PaymentMethod } from "@/app/(app)/caixa/actions";

// Loader ÚNICO do comprovante de venda: a rota de preview e a server action
// de emissão direta (celular) usam exatamente as mesmas queries.

export type ComprovanteCarregado = {
  data: ReceiptData;
  prefs: ReceiptPrefs;
  brand: ReceiptBrand;
};

type ProfileRow = {
  brand_name: string | null;
  brand_logo_path: string | null;
  receipt_paper: ReceiptPaper;
  receipt_show_logo: boolean;
  receipt_show_name: boolean;
  receipt_footer: string | null;
};

type SaleItemRow = {
  name_snapshot: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type SaleRow = {
  id: string;
  total: number;
  status: "completed" | "voided";
  payment_method: PaymentMethod;
  installments: number | null;
  discount_amount: number;
  created_at: string;
  sale_items: SaleItemRow[];
};

export async function carregarComprovante(
  saleId: string,
): Promise<
  | { ok: true; comprovante: ComprovanteCarregado }
  | { ok: false; motivo: "auth" | "not-found" }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: "auth" };

  // RLS garante que só a venda do próprio usuário é retornada.
  const { data: saleData } = await supabase
    .from("sales")
    .select(
      "id, total, status, payment_method, installments, discount_amount, created_at, sale_items(name_snapshot, unit_price, quantity, line_total)",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (!saleData) return { ok: false, motivo: "not-found" };
  const sale = saleData as SaleRow;

  const { data: profileData } = await supabase
    .from("profiles")
    .select(
      "brand_name, brand_logo_path, receipt_paper, receipt_show_logo, receipt_show_name, receipt_footer",
    )
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? {
    brand_name: null,
    brand_logo_path: null,
    receipt_paper: "80mm",
    receipt_show_logo: true,
    receipt_show_name: true,
    receipt_footer: null,
  }) as ProfileRow;

  const logoUrl = profile.brand_logo_path
    ? supabase.storage
        .from("brand-logos")
        .getPublicUrl(profile.brand_logo_path).data.publicUrl
    : null;

  const subtotal =
    Math.round(
      sale.sale_items.reduce((sum, it) => sum + Number(it.line_total), 0) *
        100,
    ) / 100;
  const discount = Math.round(Number(sale.discount_amount) * 100) / 100;

  const data: ReceiptData = {
    id: sale.id,
    createdAt: sale.created_at,
    status: sale.status,
    paymentMethod: sale.payment_method,
    installments: sale.installments,
    subtotal,
    discount,
    total: Math.round(Number(sale.total) * 100) / 100,
    items: sale.sale_items.map((it) => ({
      name: it.name_snapshot,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      lineTotal: Number(it.line_total),
    })),
  };

  const prefs: ReceiptPrefs = {
    paper: profile.receipt_paper,
    showLogo: profile.receipt_show_logo,
    showName: profile.receipt_show_name,
    footer: profile.receipt_footer,
  };

  return {
    ok: true,
    comprovante: {
      data,
      prefs,
      brand: { name: profile.brand_name, logoUrl },
    },
  };
}
