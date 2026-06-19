const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const QTY = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatBRL(value: number): string {
  return BRL.format(value);
}

export function formatQuantity(value: number): string {
  return QTY.format(value);
}

/**
 * Aceita "10", "10,50", "10.50", "1.234,56" e devolve número.
 * Retorna NaN para entrada inválida.
 */
export function parseDecimalPtBR(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return NaN;
  // Se contém vírgula, assumimos formato pt-BR: ponto = milhar, vírgula = decimal.
  // Sem vírgula, ponto pode ser decimal (ex.: scanner ou colar de outro lugar).
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// =====================================================================
// Helpers para máscara monetária (entrada digit-a-digit, em centavos)
// =====================================================================

const MAX_DIGITS = 11; // até R$ 999.999.999,99

export function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MAX_DIGITS).replace(/^0+(?=\d)/, "");
}

export function numberToDigits(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value) || value <= 0) return "";
  return Math.round(value * 100).toString();
}

export function digitsToNumber(digits: string): number {
  if (digits.length === 0) return 0;
  return Number(digits) / 100;
}

export function digitsToBRL(digits: string): string {
  return formatBRL(digitsToNumber(digits));
}

/** Formato adequado para envio em FormData / parseDecimalPtBR ("10.50"). */
export function digitsToDecimalString(digits: string): string {
  return digitsToNumber(digits).toFixed(2);
}
