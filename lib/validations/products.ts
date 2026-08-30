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

const costPriceField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    // Campo opcional: vazio significa "custo não informado" (null no banco),
    // e não zero — quem não sabe o custo ainda não pode ter lucro calculado.
    if (v === undefined || v.trim() === "") return null;
    const n = parseDecimalPtBR(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Preço de custo inválido." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({
        code: "custom",
        message: "O preço de custo não pode ser negativo.",
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

/**
 * Tags do produto. Chegam do formulário em duas listas: as que já existem
 * (por id) e as digitadas na hora (por nome) — é o que permite criar
 * categoria sem uma tela de cadastro antes.
 */
const MAX_TAGS_POR_PRODUTO = 12;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tagIdsField = z
  .array(z.string())
  .optional()
  .transform((arr) => Array.from(new Set((arr ?? []).filter((v) => v !== ""))))
  .refine((arr) => arr.every((v) => UUID.test(v)), "Categoria inválida.");

const newTagsField = z
  .array(z.string())
  .optional()
  .transform((arr, ctx) => {
    const limpas = (arr ?? []).map((t) => t.trim()).filter((t) => t !== "");
    for (const nome of limpas) {
      if (nome.length > 30) {
        ctx.addIssue({
          code: "custom",
          message: "Categoria muito longa (máx. 30 caracteres).",
        });
        return z.NEVER;
      }
    }
    // Dedupe ignorando caixa, igual ao índice único do banco.
    const vistas = new Set<string>();
    const unicas: string[] = [];
    for (const nome of limpas) {
      const chave = nome.toLocaleLowerCase("pt-BR");
      if (!vistas.has(chave)) {
        vistas.add(chave);
        unicas.push(nome);
      }
    }
    return unicas;
  });

export const productSchema = z
  .object({
    name,
    barcodes: barcodesField,
    price: priceField,
    costPrice: costPriceField,
    trackStock: z.enum(["true", "false"], {
      error: "Escolha se controla estoque.",
    }),
    stockQuantity: stockField,
    tagIds: tagIdsField,
    newTags: newTagsField,
  })
  .superRefine((data, ctx) => {
    if (data.tagIds.length + data.newTags.length > MAX_TAGS_POR_PRODUTO) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: `Escolha no máximo ${MAX_TAGS_POR_PRODUTO} categorias.`,
      });
    }
    if (data.trackStock === "true" && data.stockQuantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "Informe a quantidade em estoque.",
      });
    }
  });

export type ProductInput = z.infer<typeof productSchema>;
