export type PaymentFees = {
  pix_pct: number;
  debito_pct: number;
  credito_avista_pct: number;
  credito_parcelado_base_pct: number;
  credito_parcelado_por_parcela_pct: number;
  vale_pct: number;
};

export const DEFAULT_FEES: PaymentFees = {
  pix_pct: 0,
  debito_pct: 0,
  credito_avista_pct: 0,
  credito_parcelado_base_pct: 0,
  credito_parcelado_por_parcela_pct: 0,
  vale_pct: 0,
};

export type BrandPrefs = {
  brand_name: string | null;
  brand_logo_path: string | null;
};

/**
 * Calcula o valor da taxa cobrada em centavos sobre o total da venda.
 * Crédito parcelado: base + (parcelas adicionais × pct_por_parcela).
 * Demais métodos: porcentagem fixa do total. Dinheiro = 0.
 */
export function computeFeeAmount(
  total: number,
  method:
    | "dinheiro"
    | "pix"
    | "debito"
    | "credito_avista"
    | "credito_parcelado"
    | "vale",
  installments: number | null,
  fees: PaymentFees,
): number {
  if (total <= 0) return 0;
  let pct = 0;
  switch (method) {
    case "dinheiro":
      pct = 0;
      break;
    case "pix":
      pct = fees.pix_pct;
      break;
    case "debito":
      pct = fees.debito_pct;
      break;
    case "credito_avista":
      pct = fees.credito_avista_pct;
      break;
    case "credito_parcelado": {
      const n = Math.max(2, Math.min(24, installments ?? 2));
      pct =
        fees.credito_parcelado_base_pct +
        (n - 1) * fees.credito_parcelado_por_parcela_pct;
      break;
    }
    case "vale":
      pct = fees.vale_pct;
      break;
  }
  if (pct <= 0) return 0;
  return Math.round(total * pct) / 100;
}
