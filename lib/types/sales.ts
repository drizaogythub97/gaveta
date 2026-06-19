import type { PaymentMethod } from "@/app/(app)/caixa/actions";

export type SaleStatus = "completed" | "voided";

export type SaleItemRow = {
  id: string;
  product_id: string | null;
  name_snapshot: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type SaleRow = {
  id: string;
  total: number;
  status: SaleStatus;
  payment_method: PaymentMethod;
  created_at: string;
  sale_items: SaleItemRow[];
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  vale: "Vale alim./refeição",
};
