import { z } from "zod";

const MAX_MONEY = 99_999_999.99;

const money = z.coerce
  .number({ message: "Valor inválido." })
  .finite("Valor inválido.")
  .min(0, "Valor inválido.")
  .max(MAX_MONEY, "Valor muito alto.");

const note = z
  .string()
  .trim()
  .max(280, "Observação muito longa.")
  .optional();

export const openSessionSchema = z.object({
  opening: money,
  note,
});

export const cashMovementSchema = z.object({
  type: z.enum(["sangria", "suprimento"], { message: "Tipo inválido." }),
  amount: money.refine((v) => v > 0, "Informe um valor maior que zero."),
  note,
});

export const closeSessionSchema = z.object({
  counted: money,
  note,
});
