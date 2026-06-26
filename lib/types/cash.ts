export type CashSessionStatus = "open" | "closed";

export type CashMovementType = "sangria" | "suprimento";

export type CashSession = {
  id: string;
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  counted_amount: number | null;
  expected_amount: number | null;
  difference_amount: number | null;
  status: CashSessionStatus;
  opening_note: string | null;
  closing_note: string | null;
};

export type CashMovement = {
  id: string;
  session_id: string;
  type: CashMovementType;
  amount: number;
  note: string | null;
  created_at: string;
};

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  sangria: "Sangria (retirada)",
  suprimento: "Suprimento (reforço)",
};
