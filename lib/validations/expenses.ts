import { z } from "zod";

import { EXPENSE_CATEGORIES } from "@/lib/types/expenses";

export const expenseSchema = z.object({
  incurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]], {
    message: "Categoria inválida.",
  }),
  amount: z.coerce
    .number({ message: "Valor inválido." })
    .finite("Valor inválido.")
    .gt(0, "Informe um valor maior que zero.")
    .max(99_999_999.99, "Valor muito alto."),
  description: z.string().trim().max(280, "Descrição muito longa.").optional(),
});
