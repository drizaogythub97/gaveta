import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProductTag } from "@/lib/types/db";

/**
 * Categorias que o dono já criou, em ordem alfabética.
 *
 * Uma consulta só, usada tanto pelos formulários (a lista de marcar) quanto
 * pela listagem de produtos (o filtro). A RLS já restringe ao dono — o
 * `user_id` não precisa entrar na query.
 */
export async function listarTags(
  supabase: SupabaseClient,
): Promise<ProductTag[]> {
  const { data } = await supabase
    .from("product_tags")
    .select("id, name")
    .order("name", { ascending: true });
  return (data ?? []) as ProductTag[];
}
