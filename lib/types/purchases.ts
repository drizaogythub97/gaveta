/** Como a nota entrou no sistema. 'manual' é a digitação (G2a); os demais
 *  ficam prontos para a extração de PDF/XML da fase G2b. */
export type PurchaseSource = "manual" | "pdf" | "foto" | "xml" | "ia";

export type Purchase = {
  id: string;
  supplier_name: string | null;
  access_key: string | null;
  issued_on: string; // YYYY-MM-DD
  total: number;
  source: PurchaseSource;
  created_at: string;
  /** Quando a nota foi cancelada (estorno). Null = nota ativa. */
  voided_at: string | null;
};

export type PurchaseItem = {
  id: string;
  product_id: string | null;
  description_snapshot: string;
  barcode: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export const PURCHASE_SOURCE_LABELS: Record<PurchaseSource, string> = {
  manual: "Digitada",
  pdf: "PDF da nota",
  foto: "Foto da nota",
  xml: "XML da nota",
  ia: "Lida por IA",
};
