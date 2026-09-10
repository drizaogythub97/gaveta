"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  editPurchaseSchema,
  purchaseSchema,
  voidPurchaseSchema,
  type EditPurchaseInput,
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

function editErrorToPortuguese(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (
    msg.includes("uniq_purchases_user_access_key") ||
    msg.includes("duplicate key")
  ) {
    return "Outra nota ativa já usa esta chave de acesso.";
  }
  if (msg.includes("uniq_product_barcodes_user_barcode")) {
    return "Um dos códigos de barras já está em uso em outro produto.";
  }
  if (msg.includes("cancelada")) {
    return "Nota cancelada não pode ser corrigida. Lance a nota certa.";
  }
  if (msg.includes("nota não encontrada")) {
    return "Nota não encontrada.";
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
  return "Não foi possível salvar a correção. Tente novamente.";
}

export type EditPurchaseResult =
  | {
      ok: true;
      purchaseId: string;
      total: number;
      /** Produtos cujo estoque não pôde descer tudo (parte já foi vendida). */
      estoqueParcial: boolean;
      /** Produtos que tiveram o "último custo" ajustado pela correção. */
      custosAjustados: number;
      /** O que aconteceu com o gasto em insumos vinculado à nota. */
      gasto: "atualizado" | "criado" | "removido" | "nenhum";
    }
  | { ok: false; error: string };

/**
 * Corrige uma nota já lançada (roadmap H1). Uma chamada à RPC transacional
 * editar_compra: troca os itens e acerta, de uma vez só, o estoque (pela
 * DIFERENÇA, para não apagar o que já foi vendido), o último custo dos
 * produtos e o gasto em insumos. As vendas já fechadas não são tocadas —
 * o custo delas é snapshot.
 */
export async function editarCompra(
  input: EditPurchaseInput,
): Promise<EditPurchaseResult> {
  const parsed = editPurchaseSchema.safeParse(input);
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

  const { data, error } = await supabase.rpc("editar_compra", {
    p_purchase_id: parsed.data.purchaseId,
    p_purchase: {
      supplier_name: parsed.data.supplierName,
      access_key: parsed.data.accessKey,
      issued_on: parsed.data.issuedOn,
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
    return { ok: false, error: editErrorToPortuguese(error?.message) };
  }

  const resumo = data as {
    purchase_id: string;
    total: number;
    estoque_parcial: boolean;
    custos_ajustados: number;
    gasto: string;
  };

  // A correção mexe em estoque, produtos e financeiro — todos precisam
  // refletir, exatamente como o lançamento e o estorno.
  revalidatePath("/estoque");
  revalidatePath("/estoque/compras");
  revalidatePath(`/estoque/compras/${parsed.data.purchaseId}`);
  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/produtos");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");

  return {
    ok: true,
    purchaseId: resumo.purchase_id,
    total: Number(resumo.total),
    estoqueParcial: Boolean(resumo.estoque_parcial),
    custosAjustados: Number(resumo.custos_ajustados),
    gasto: resumo.gasto as "atualizado" | "criado" | "removido" | "nenhum",
  };
}
