import { formatBRL } from "@/lib/products/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/types/sales";

import {
  FISCAL_DISCLAIMER,
  type ReceiptBrand,
  type ReceiptData,
  type ReceiptPrefs,
} from "./types";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function paymentLabel(data: ReceiptData): string {
  if (data.paymentMethod === "credito_parcelado" && data.installments) {
    return `Crédito ${data.installments}x`;
  }
  return PAYMENT_METHOD_LABELS[data.paymentMethod];
}

/**
 * Versão em texto puro do comprovante, para compartilhar no celular (Web
 * Share → WhatsApp, e-mail, etc.). Não é a rota /comprovante (que é privada
 * por RLS): é o conteúdo legível para entregar ao cliente.
 */
export function buildReceiptText(
  data: ReceiptData,
  prefs: ReceiptPrefs,
  brand: ReceiptBrand,
): string {
  const lines: string[] = [];
  const name = prefs.showName ? (brand.name ?? "Gaveta") : null;
  if (name) lines.push(name);
  lines.push(formatDateTime(data.createdAt));
  lines.push(`Venda nº ${data.id.slice(0, 8).toUpperCase()}`);
  if (data.status === "voided") lines.push("** VENDA ESTORNADA **");
  lines.push("--------------------------------");
  for (const item of data.items) {
    const qty = item.quantity.toString().replace(".", ",");
    lines.push(`${item.name}`);
    lines.push(
      `  ${qty} x ${formatBRL(item.unitPrice)}   ${formatBRL(item.lineTotal)}`,
    );
  }
  lines.push("--------------------------------");
  if (data.discount > 0) {
    lines.push(`Subtotal: ${formatBRL(data.subtotal)}`);
    lines.push(`Desconto: - ${formatBRL(data.discount)}`);
  }
  lines.push(`TOTAL: ${formatBRL(data.total)}`);
  lines.push(`Pagamento: ${paymentLabel(data)}`);
  const footer = prefs.footer?.trim();
  if (footer) lines.push(footer);
  lines.push(FISCAL_DISCLAIMER);
  return lines.join("\n");
}
