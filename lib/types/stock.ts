export type StockMovementType = "sale" | "void" | "restock" | "adjust";

export type StockMovementRow = {
  id: string;
  type: StockMovementType;
  quantity: number;
  sale_id: string | null;
  note: string | null;
  created_at: string;
  products: { name: string } | null;
};

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  sale: "Venda",
  void: "Estorno",
  restock: "Reposição",
  adjust: "Ajuste",
};
