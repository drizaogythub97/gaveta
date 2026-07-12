import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ponte "marca única" (ecossistema, estágio 2) está ligada para o usuário?
 * Server-only (as actions passam o client já autenticado).
 */
export async function marcaUnicaAtiva(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("ecossistema_prefs")
    .select("marca_unica")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.marca_unica);
}
