import { formatBRL } from "@/lib/products/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/types/sales";
import {
  FISCAL_DISCLAIMER,
  type ReceiptBrand,
  type ReceiptData,
  type ReceiptPaper,
  type ReceiptPrefs,
} from "@/lib/receipt/types";

import styles from "./receipt.module.css";

const PAPER_CLASS: Record<ReceiptPaper, string> = {
  "80mm": styles.paper80,
  "58mm": styles.paper58,
  a4: styles.paperA4,
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatQty(qty: number): string {
  return qty.toString().replace(".", ",");
}

function paymentLabel(data: ReceiptData): string {
  if (data.paymentMethod === "credito_parcelado" && data.installments) {
    return `Crédito ${data.installments}x`;
  }
  // Venda a prazo (ponte FiadoApp): não é forma de caixa, por isso fica fora
  // do tipo PaymentMethod — rotulada à parte.
  if ((data.paymentMethod as string) === "fiado") {
    return "Venda a prazo (Fiado)";
  }
  return PAYMENT_METHOD_LABELS[data.paymentMethod] ?? "—";
}

/**
 * Comprovante de venda (não fiscal). Componente apresentacional puro,
 * reutilizado pela rota de impressão e pela pré-visualização das
 * preferências. Todo texto do usuário (nome/rodapé) é escapado pelo React.
 */
export function Receipt({
  data,
  prefs,
  brand,
}: {
  data: ReceiptData;
  prefs: ReceiptPrefs;
  brand: ReceiptBrand;
}) {
  const displayName = prefs.showName ? (brand.name ?? "Gaveta") : null;
  const showLogo = prefs.showLogo && Boolean(brand.logoUrl);
  const voided = data.status === "voided";
  const footer = prefs.footer?.trim();

  return (
    <div className={`${styles.receipt} ${PAPER_CLASS[prefs.paper]}`}>
      {showLogo || displayName ? (
        <div className={styles.header}>
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl!} alt="" className={styles.logo} />
          ) : null}
          {displayName ? <div className={styles.name}>{displayName}</div> : null}
        </div>
      ) : null}

      <div className={styles.meta}>
        <div>{formatDateTime(data.createdAt)}</div>
        <div>Venda nº {data.id.slice(0, 8).toUpperCase()}</div>
      </div>

      {voided ? <div className={styles.voided}>VENDA ESTORNADA</div> : null}

      <hr className={styles.divider} />

      <table className={styles.items}>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td className={styles.itemName}>
                {item.name}
                <div className={styles.itemQty}>
                  {formatQty(item.quantity)} × {formatBRL(item.unitPrice)}
                </div>
              </td>
              <td className={`${styles.itemTotal} ${styles.tabular}`}>
                {formatBRL(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className={styles.divider} />

      <div className={styles.totals}>
        {data.discount > 0 ? (
          <>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span className={styles.tabular}>{formatBRL(data.subtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Desconto</span>
              <span className={styles.tabular}>− {formatBRL(data.discount)}</span>
            </div>
          </>
        ) : null}
        <div className={styles.grandTotal}>
          <span>Total</span>
          <span className={styles.tabular}>{formatBRL(data.total)}</span>
        </div>
      </div>

      <div className={styles.payment}>Pagamento: {paymentLabel(data)}</div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}

      <div className={styles.disclaimer}>{FISCAL_DISCLAIMER}</div>
    </div>
  );
}
