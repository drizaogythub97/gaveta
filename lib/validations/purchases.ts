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

// Categorias do produto novo (0019). Chegam em duas listas: as que já
// existem, por id, e as digitadas na hora, por nome — é o banco que decide
// o que criar, na mesma transação da nota.
const MAX_TAGS_POR_ITEM = 12;

const tagIds = z
  .array(z.uuid("Categoria inválida."))
  .max(MAX_TAGS_POR_ITEM, "Escolha no máximo 12 categorias.")
  .default([]);

const newTags = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Categoria sem nome.")
      .max(30, "Categoria muito longa (máx. 30 caracteres)."),
  )
  .max(MAX_TAGS_POR_ITEM, "Escolha no máximo 12 categorias.")
  .default([]);

const purchaseItemBase = z.object({
  productId: z.uuid("Produto inválido.").nullable(),
  isNew: z.boolean(),
  description,
  barcode,
  quantity,
  unitCost,
  salePrice,
  trackStock: z.boolean(),
  tagIds,
  newTags,
});

type PurchaseItemBase = z.output<typeof purchaseItemBase>;

/** Regras comuns ao lançamento e à correção da nota. */
function checarItem(item: PurchaseItemBase, ctx: z.RefinementCtx): boolean {
  if (item.isNew && item.productId !== null) {
    ctx.addIssue({
      code: "custom",
      message: "Item novo não pode apontar para um produto já cadastrado.",
    });
    return false;
  }
  if (item.isNew && (item.salePrice === null || item.salePrice <= 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["salePrice"],
      message: `Informe o preço de venda de "${item.description}".`,
    });
  }
  return true;
}

export const purchaseItemSchema = purchaseItemBase.superRefine((item, ctx) => {
  if (!checarItem(item, ctx)) return;
  if (!item.isNew && item.productId === null) {
    ctx.addIssue({
      code: "custom",
      path: ["productId"],
      message: `Escolha o produto de "${item.description}" ou marque como novo.`,
    });
  }
});

/**
 * Item de uma nota que está sendo CORRIGIDA. Difere do lançamento num
 * ponto: aceita a linha sem produto vinculado. Ela existe de verdade nas
 * notas antigas — quando o produto é apagado, purchase_items.product_id
 * vira null (on delete set null) — e a correção não pode ser o momento em
 * que essa linha desaparece do histórico sem o dono mandar.
 */
export const editPurchaseItemSchema = purchaseItemBase.superRefine(
  (item, ctx) => {
    checarItem(item, ctx);
  },
);

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

/**
 * Correção de uma nota já lançada (roadmap H1). O cabeçalho é o mesmo do
 * lançamento MENOS a origem: como a nota entrou (digitada, PDF, XML, foto,
 * IA) é histórico e não se reescreve — o banco também barra.
 */
export const editPurchaseSchema = z.object({
  purchaseId: z.uuid("Nota inválida."),
  supplierName: purchaseSchema.shape.supplierName,
  accessKey,
  issuedOn,
  items: z
    .array(editPurchaseItemSchema)
    .min(1, "A nota precisa ter ao menos um item.")
    .max(200, "Nota com itens demais (máx. 200)."),
});

export type EditPurchaseInput = z.input<typeof editPurchaseSchema>;
