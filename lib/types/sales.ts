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
  installments: number | null;
  fee_amount: number;
  discount_amount: number;
  created_at: string;
  sale_items: SaleItemRow[];
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
  vale: "Vale alim./refeição",
};

/**
 * Formas de pagamento de CAIXA (dinheiro na mão / cartão / pix / vale).
 * Não inclui 'fiado' (venda a prazo = a receber, não faturamento de caixa):
 * passar esta lista ao sales_summary exclui o fiado dos totais. Fonte única
 * para financeiro e dashboard — ver Ecossistema F6, Fase 2.
 */
export const CAIXA_PAYMENT_METHODS: PaymentMethod[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_avista",
  "credito_parcelado",
  "vale",
];
