"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  purchaseSchema,
  voidPurchaseSchema,
  type PurchaseInput,
} from "@/lib/validations/purchases";

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

function voidErrorToPortuguese(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("já foi cancelada")) {
    return "Esta nota já foi cancelada.";
  }
  if (msg.includes("nota não encontrada")) {
    return "Nota não encontrada.";
  }
  if (msg.includes("histórico")) {
    return "Esta nota é histórico e não pode ser alterada.";
  }
  if (msg.includes("não autenticado")) {
    return "Sessão expirada. Entre novamente.";
  }
  return "Não foi possível cancelar a nota. Tente novamente.";
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
      tags: item.tagIds,
      new_tags: item.newTags,
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

export type VoidPurchaseResult =
  | {
      ok: true;
      /** Itens da nota que ainda tinham produto vinculado. */
      itensEstornados: number;
      /** Parte da mercadoria já havia saído: o estoque saiu só até zerar. */
      estoqueParcial: boolean;
      /** Produtos cujo "último custo" voltou ao da compra anterior. */
      custosRevertidos: number;
      /** O gasto automático em insumos foi removido do financeiro. */
      gastoRemovido: boolean;
    }
  | { ok: false; error: string };

/**
 * Cancela (estorna) uma nota lançada por engano — plano 08, fase G2a.1.
 * Uma chamada à RPC transacional estornar_compra: tira o estoque que
 * entrou, desfaz o último custo, remove o gasto em insumos e marca a nota
 * como cancelada. O histórico da nota NÃO é apagado.
 */
export async function estornarCompra(
  purchaseId: string,
): Promise<VoidPurchaseResult> {
  const parsed = voidPurchaseSchema.safeParse({ purchaseId });
  if (!parsed.success) {
    return { ok: false, error: "Nota inválida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }

  const { data, error } = await supabase.rpc("estornar_compra", {
    p_purchase_id: parsed.data.purchaseId,
  });

  if (error || !data) {
    return { ok: false, error: voidErrorToPortuguese(error?.message) };
  }

  const resumo = data as {
    itens_estornados: number;
    estoque_parcial: boolean;
    custos_revertidos: number;
    gasto_removido: boolean;
  };

  // O estorno mexe em estoque, produtos e financeiro — todos precisam refletir.
  revalidatePath("/estoque");
  revalidatePath("/estoque/compras");
  revalidatePath(`/estoque/compras/${parsed.data.purchaseId}`);
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/produtos");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");

  return {
    ok: true,
    itensEstornados: Number(resumo.itens_estornados),
    estoqueParcial: Boolean(resumo.estoque_parcial),
    custosRevertidos: Number(resumo.custos_revertidos),
    gastoRemovido: Boolean(resumo.gasto_removido),
  };
}
