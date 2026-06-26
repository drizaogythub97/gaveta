export type ExpenseCategory =
  | "insumos"
  | "salarios"
  | "aluguel"
  | "contas"
  | "impostos"
  | "outros";

export type Expense = {
  id: string;
  incurred_on: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  created_at: string;
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "insumos",
  "salarios",
  "aluguel",
  "contas",
  "impostos",
  "outros",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  insumos: "Insumos / mercadorias",
  salarios: "Salários",
  aluguel: "Aluguel",
  contas: "Contas (água, luz, etc.)",
  impostos: "Impostos",
  outros: "Outros",
};
