import { z } from "zod";

import { RECEIPT_FOOTER_MAX, RECEIPT_PAPERS } from "@/lib/receipt/types";

export const receiptPrefsSchema = z.object({
  paper: z.enum(RECEIPT_PAPERS as unknown as [string, ...string[]], {
    message: "Formato de papel inválido.",
  }),
  show_logo: z.coerce.boolean(),
  show_name: z.coerce.boolean(),
  footer: z
    .string()
    .trim()
    .max(RECEIPT_FOOTER_MAX, "Mensagem de rodapé muito longa.")
    .optional(),
});
