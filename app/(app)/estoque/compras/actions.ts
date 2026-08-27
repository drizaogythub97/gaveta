"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { purchaseSchema, type PurchaseInput } from "@/lib/validations/purchases";

export type RegisterPurchaseResult =
  | {
      ok: true;
      purchaseId: string;
      total: number;
      produtosAtualizados: number;
      produtosNovos: number;
    }
  | { ok: false; error: string };

function rpcErrorToPortuguese(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (
    msg.includes("uniq_purchases_user_access_key") ||
    msg.includes("duplicate key")
  ) {
    return "Esta nota já foi lançada (mesma chave de acesso).";
  }
  if (msg.includes("uniq_product_barcodes_user_barcode")) {
    return "Um dos códigos de barras já está em uso em outro produto.";
  }
  if (msg.includes("produto não encontrado")) {
    return "Um dos produtos da nota não existe mais. Refaça a linha.";
  }
  if (msg.includes("chave de acesso inválida")) {
    return "A chave da nota tem 44 números. Confira ou deixe em branco.";
  }
  if (msg.includes("não autenticado")) {
    return "Sessão expirada. Entre novamente.";
  }
  return "Não foi possível lançar a nota. Tente novamente.";
}

/**
 * Lança a nota de compra: uma chamada à RPC transacional registrar_compra
 * (nota + itens + estoque + último custo + produtos novos + gasto em
 * insumos). Qualquer erro no meio → nada é gravado.
 */
export async function registrarCompra(
  input: PurchaseInput,
): Promise<RegisterPurchaseResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Confira os dados da nota.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }

  const { data, error } = await supabase.rpc("registrar_compra", {
    p_purchase: {
      supplier_name: parsed.data.supplierName,
      access_key: parsed.data.accessKey,
      issued_on: parsed.data.issuedOn,
      source: parsed.data.source,
    },
    p_itens: parsed.data.items.map((item) => ({
      product_id: item.productId,
      is_new: item.isNew,
      description: item.description,
      barcode: item.barcode,
      quantity: item.quantity,
      unit_cost: item.unitCost,
      sale_price: item.salePrice,
      track_stock: item.trackStock,
    })),
  });

  if (error || !data) {
    return { ok: false, error: rpcErrorToPortuguese(error?.message) };
  }

  const resumo = data as {
    purchase_id: string;
    total: number;
    produtos_atualizados: number;
    produtos_novos: number;
  };

  // A nota mexe em estoque, produtos e financeiro — todos precisam refletir.
  revalidatePath("/estoque");
  revalidatePath("/estoque/compras");
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/produtos");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");

  return {
    ok: true,
    purchaseId: resumo.purchase_id,
    total: Number(resumo.total),
    produtosAtualizados: Number(resumo.produtos_atualizados),
    produtosNovos: Number(resumo.produtos_novos),
  };
}
