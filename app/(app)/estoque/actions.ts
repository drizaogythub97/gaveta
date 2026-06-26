"use server";

import { revalidatePath } from "next/cache";

import { parseDecimalPtBR } from "@/lib/products/format";
import { createClient } from "@/lib/supabase/server";

export type StockUpdateResult = {
  ok: boolean;
  error?: string;
};

export async function updateStock(
  formData: FormData,
): Promise<StockUpdateResult> {
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const rawQty = String(formData.get("quantity") ?? "");

  if (!id) return { ok: false, error: "Produto inválido." };
  if (mode !== "set" && mode !== "add") {
    return { ok: false, error: "Modo inválido." };
  }

  const qty = parseDecimalPtBR(rawQty);
  if (!Number.isFinite(qty) || qty < 0) {
    return { ok: false, error: "Quantidade inválida." };
  }
  if (mode === "add" && qty === 0) {
    return { ok: false, error: "Informe a quantidade que chegou." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  // RPC transacional: ajusta o estoque e registra o movimento
  // (reposição/ajuste) em stock_movements de uma só vez.
  const { error: rpcError } = await supabase.rpc("adjust_stock", {
    p_product_id: id,
    p_mode: mode,
    p_quantity: qty,
  });

  if (rpcError) {
    const msg = rpcError.message?.toLowerCase() ?? "";
    if (msg.includes("não encontrado")) {
      return { ok: false, error: "Produto não encontrado." };
    }
    if (msg.includes("não controla estoque")) {
      return { ok: false, error: "Este produto não controla estoque." };
    }
    return { ok: false, error: "Não foi possível atualizar." };
  }

  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { ok: true };
}
