import type { PaymentMethod } from "@/app/(app)/caixa/actions";

export type ReceiptPaper = "80mm" | "58mm" | "a4";

export type ReceiptPrefs = {
  paper: ReceiptPaper;
  showLogo: boolean;
  showName: boolean;
  footer: string | null;
};

export const DEFAULT_RECEIPT_PREFS: ReceiptPrefs = {
  paper: "80mm",
  showLogo: true,
  showName: true,
  footer: null,
};

export const RECEIPT_PAPERS: ReadonlyArray<ReceiptPaper> = [
  "80mm",
  "58mm",
  "a4",
];

export const RECEIPT_PAPER_LABELS: Record<ReceiptPaper, string> = {
  "80mm": "Bobina 80 mm (padrão)",
  "58mm": "Bobina 58 mm",
  a4: "Folha A4",
};

export const RECEIPT_FOOTER_MAX = 120;

// Aviso obrigatório: o comprovante não substitui documento fiscal.
export const FISCAL_DISCLAIMER = "Este documento não tem valor fiscal.";

export type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

// Dados da venda necessários para montar o comprovante. O total já vem
// líquido de desconto (a taxa da maquininha nunca aparece no comprovante).
export type ReceiptData = {
  id: string;
  createdAt: string;
  status: "completed" | "voided";
  paymentMethod: PaymentMethod;
  installments: number | null;
  subtotal: number;
  discount: number;
  total: number;
  items: ReceiptItem[];
};

export type ReceiptBrand = {
  name: string | null;
  logoUrl: string | null;
};
