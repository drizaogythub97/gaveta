import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET_LOGOS = "brand-logos";

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

/**
 * Remove um arquivo de logo do bucket, MAS nunca um que ainda esteja em uso
 * — nem como logo atual de algum dos apps, nem como backup da marca única.
 * Sem esse guarda, uma troca de logo durante a marca única apagaria o
 * arquivo guardado para o "voltar ao anterior", quebrando a restauração.
 */
export async function removerLogoSeguro(
  supabase: SupabaseClient,
  userId: string,
  path: string | null,
): Promise<void> {
  if (!path) return;
  const [{ data: fiado }, { data: perfil }, { data: eco }] = await Promise.all([
    supabase
      .from("fiado_preferencias")
      .select("brand_logo_path")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("brand_logo_path")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("ecossistema_prefs")
      .select("bak_fiado_brand_logo_path, bak_gaveta_brand_logo_path")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const emUso = new Set(
    [
      fiado?.brand_logo_path,
      perfil?.brand_logo_path,
      eco?.bak_fiado_brand_logo_path,
      eco?.bak_gaveta_brand_logo_path,
    ].filter(Boolean) as string[],
  );
  if (emUso.has(path)) return;
  await supabase.storage.from(BUCKET_LOGOS).remove([path]);
}
