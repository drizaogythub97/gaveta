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
  /** Quando a nota foi corrigida pela última vez. Null = nunca editada. */
  edited_at: string | null;
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

/**
 * A nota como ela chega à tela de correção (roadmap H1). É o formulário de
 * lançamento preenchido com o que já está gravado — por isso os itens vêm
 * com o nome ATUAL do produto (é ele que a correção vai atualizar) e com a
 * descrição da nota ao lado, para comparar.
 */
export type PurchaseEditItem = {
  productId: string | null;
  name: string;
  barcode: string;
  quantity: number;
  unitCost: number;
  trackStock: boolean;
  descricaoNota: string | null;
};

export type PurchaseEdit = {
  purchaseId: string;
  supplier: string;
  issuedOn: string;
  accessKey: string;
  itens: PurchaseEditItem[];
};
