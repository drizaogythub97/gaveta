import { z } from "zod";

/**
 * Entrada por nota (plano 08, fase G2a). Este schema é a validação do
 * SERVIDOR: o formulário já ajuda o usuário, mas nada entra no banco sem
 * passar por aqui. A RPC registrar_compra revalida o essencial no banco.
 */

const MAX_MONEY = 99_999_999.99;

const description = z
  .string()
  .trim()
  .min(1, "Informe o nome do item.")
  .max(200, "Nome do item muito longo (máx. 200 caracteres).");

const barcode = z
  .string()
  .trim()
  .max(64, "Código de barras muito longo (máx. 64 caracteres).")
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

const quantity = z
  .number({ error: "Quantidade inválida." })
  .finite("Quantidade inválida.")
  .gt(0, "A quantidade precisa ser maior que zero.")
  .max(999_999.999, "Quantidade muito alta.");

const unitCost = z
  .number({ error: "Custo inválido." })
  .finite("Custo inválido.")
  .min(0, "O custo não pode ser negativo.")
  .max(MAX_MONEY, "Custo muito alto.");

const salePrice = z
  .number({ error: "Preço de venda inválido." })
  .finite("Preço de venda inválido.")
  .min(0, "O preço de venda não pode ser negativo.")
  .max(MAX_MONEY, "Preço de venda muito alto.")
  .nullable();

export const purchaseItemSchema = z
  .object({
    productId: z.uuid("Produto inválido.").nullable(),
    isNew: z.boolean(),
    description,
    barcode,
    quantity,
    unitCost,
    salePrice,
    trackStock: z.boolean(),
  })
  .superRefine((item, ctx) => {
    if (item.isNew && item.productId !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Item novo não pode apontar para um produto já cadastrado.",
      });
      return;
    }
    if (item.isNew && (item.salePrice === null || item.salePrice <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: `Informe o preço de venda de "${item.description}".`,
      });
    }
    if (!item.isNew && item.productId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message: `Escolha o produto de "${item.description}" ou marque como novo.`,
      });
    }
  });

/** Aceita a chave copiada com espaços/pontos; exige 44 dígitos no fim. */
const accessKey = z
  .string()
  .nullish()
  .transform((v) => (v ?? "").replace(/[\s.]/g, ""))
  .transform((v, ctx) => {
    if (v.length === 0) return null;
    if (!/^\d{44}$/.test(v)) {
      ctx.addIssue({
        code: "custom",
        message: "A chave da nota tem 44 números. Confira ou deixe em branco.",
      });
      return z.NEVER;
    }
    return v;
  });

const issuedOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da compra.")
  .refine((v) => {
    const hoje = new Date().toISOString().slice(0, 10);
    return v <= hoje;
  }, "A data da compra não pode ser no futuro.");

export const purchaseSchema = z.object({
  supplierName: z
    .string()
    .trim()
    .max(120, "Nome do fornecedor muito longo (máx. 120 caracteres).")
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  accessKey,
  issuedOn,
  source: z.enum(["manual", "pdf", "foto", "xml", "ia"]),
  items: z
    .array(purchaseItemSchema)
    .min(1, "Adicione ao menos um item à nota.")
    .max(200, "Nota com itens demais (máx. 200)."),
});

export type PurchaseInput = z.input<typeof purchaseSchema>;
export type PurchaseParsed = z.output<typeof purchaseSchema>;

/**
 * Estorno de nota (fase G2a.1). O identificador vem da URL, então o
 * servidor confere que é mesmo um uuid antes de chamar a RPC.
 */
export const voidPurchaseSchema = z.object({
  purchaseId: z.uuid("Nota inválida."),
});
