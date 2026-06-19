import { z } from "zod";

import { parseDecimalPtBR } from "@/lib/products/format";

const name = z
  .string()
  .trim()
  .min(1, "Informe o nome do produto.")
  .max(120, "Nome muito longo (máx. 120 caracteres).");

const priceField = z
  .string()
  .min(1, "Informe o preço.")
  .transform((v, ctx) => {
    const n = parseDecimalPtBR(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Preço inválido." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({
        code: "custom",
        message: "O preço não pode ser negativo.",
      });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const stockField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === "") return null;
    const n = parseDecimalPtBR(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Quantidade inválida." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({
        code: "custom",
        message: "A quantidade não pode ser negativa.",
      });
      return z.NEVER;
    }
    return n;
  });

const barcodesField = z
  .array(z.string())
  .optional()
  .transform((arr, ctx) => {
    if (!arr) return [] as string[];
    const cleaned = arr
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    for (const code of cleaned) {
      if (code.length > 64) {
        ctx.addIssue({
          code: "custom",
          message: "Código de barras muito longo (máx. 64 caracteres).",
        });
        return z.NEVER;
      }
    }
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const code of cleaned) {
      if (!seen.has(code)) {
        seen.add(code);
        deduped.push(code);
      }
    }
    return deduped;
  });

export const productSchema = z
  .object({
    name,
    barcodes: barcodesField,
    price: priceField,
    trackStock: z.enum(["true", "false"], {
      error: "Escolha se controla estoque.",
    }),
    stockQuantity: stockField,
  })
  .superRefine((data, ctx) => {
    if (data.trackStock === "true" && data.stockQuantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "Informe a quantidade em estoque.",
      });
    }
  });

export type ProductInput = z.infer<typeof productSchema>;
