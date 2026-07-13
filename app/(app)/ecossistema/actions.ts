"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { removerLogoSeguro } from "@/lib/ecossistema-server";
import { createClient } from "@/lib/supabase/server";

const ativoSchema = z.boolean();

/**
 * Liga/desliga o atalho do ecossistema (estágio 1). A preferência vale a
 * CONTA (tabela compartilhada `ecossistema_prefs`), então o atalho aparece
 * ou some nos dois apps ao mesmo tempo.
 */
export async function salvarSwitcher(
  ativo: boolean,
): Promise<{ error?: string }> {
  const parsed = ativoSchema.safeParse(ativo);
  if (!parsed.success) {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre de novo." };

  const { error } = await supabase.from("ecossistema_prefs").upsert({
    user_id: user.id,
    switcher_ativo: parsed.data,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  // O switcher vive no layout — revalida a árvore toda.
  revalidatePath("/", "layout");
  return {};
}

/**
 * Liga/desliga a ponte "Fiado no PDV" (Fase 1). Preferência da CONTA
 * (tabela compartilhada), vale nos dois apps: ligada, o caixa passa a
 * oferecer a forma de pagamento "Venda a Prazo (Fiado)". Opt-in, nasce
 * desligada. Desligar só esconde a opção — as vendas a prazo já lançadas
 * são a-receber reais e permanecem (Manter/Excluir vem na Fase 4).
 */
export async function salvarFiadoPdv(
  ativo: boolean,
): Promise<{ error?: string }> {
  const parsed = ativoSchema.safeParse(ativo);
  if (!parsed.success) {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre de novo." };

  const { error } = await supabase.from("ecossistema_prefs").upsert({
    user_id: user.id,
    fiado_pdv_ativo: parsed.data,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/ecossistema");
  revalidatePath("/caixa");
  return {};
}

/**
 * Liga/desliga a MARCA ÚNICA (estágio 2). Ao ATIVAR, a marca DESTE app
 * (Gaveta) é copiada para o FiadoApp; com a ponte ligada, salvar a marca
 * em qualquer app grava nos dois. Desligar não apaga nada — cada app
 * volta a valer a própria marca.
 */
export async function salvarMarcaUnica(
  ativo: boolean,
): Promise<{ error?: string }> {
  const parsed = ativoSchema.safeParse(ativo);
  if (!parsed.success) {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre de novo." };

  const now = new Date().toISOString();
  const { data: prev } = await supabase
    .from("ecossistema_prefs")
    .select(
      "marca_unica, bak_fiado_brand_name, bak_fiado_brand_logo_path, bak_gaveta_brand_name, bak_gaveta_brand_logo_path",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const jaAtivo = Boolean(prev?.marca_unica);

  if (parsed.data && !jaAtivo) {
    // ── ATIVAR ── guarda as duas marcas; a do Gaveta passa a valer.
    const [{ data: perfil }, { data: fiadoMarca }] = await Promise.all([
      supabase
        .from("profiles")
        .select("brand_name, brand_logo_path")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("fiado_preferencias")
        .select("brand_name, brand_logo_path")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const { error } = await supabase.from("ecossistema_prefs").upsert({
      user_id: user.id,
      marca_unica: true,
      bak_fiado_brand_name: fiadoMarca?.brand_name ?? null,
      bak_fiado_brand_logo_path: fiadoMarca?.brand_logo_path ?? null,
      bak_gaveta_brand_name: perfil?.brand_name ?? null,
      bak_gaveta_brand_logo_path: perfil?.brand_logo_path ?? null,
      updated_at: now,
    });
    if (error) return { error: "Não foi possível salvar. Tente de novo." };
    await supabase.from("fiado_preferencias").upsert({
      user_id: user.id,
      brand_name: perfil?.brand_name ?? null,
      brand_logo_path: perfil?.brand_logo_path ?? null,
      updated_at: now,
    });
  } else if (!parsed.data && jaAtivo) {
    // ── DESATIVAR ── cada app volta à marca anterior; limpa backup.
    const { data: atual } = await supabase
      .from("profiles")
      .select("brand_logo_path")
      .eq("id", user.id)
      .maybeSingle();
    const arquivoSessao = (atual?.brand_logo_path as string | null) ?? null;
    await Promise.all([
      supabase.from("fiado_preferencias").upsert({
        user_id: user.id,
        brand_name: prev?.bak_fiado_brand_name ?? null,
        brand_logo_path: prev?.bak_fiado_brand_logo_path ?? null,
        updated_at: now,
      }),
      supabase
        .from("profiles")
        .update({
          brand_name: prev?.bak_gaveta_brand_name ?? null,
          brand_logo_path: prev?.bak_gaveta_brand_logo_path ?? null,
        })
        .eq("id", user.id),
    ]);
    await supabase.from("ecossistema_prefs").upsert({
      user_id: user.id,
      marca_unica: false,
      bak_fiado_brand_name: null,
      bak_fiado_brand_logo_path: null,
      bak_gaveta_brand_name: null,
      bak_gaveta_brand_logo_path: null,
      updated_at: now,
    });
    // O arquivo da sessão só é apagado se não voltou a ser usado por algum
    // app (o guarda protege os logos restaurados).
    await removerLogoSeguro(supabase, user.id, arquivoSessao);
  } else {
    // Sem transição real: só garante a flag.
    await supabase.from("ecossistema_prefs").upsert({
      user_id: user.id,
      marca_unica: parsed.data,
      updated_at: now,
    });
  }

  revalidatePath("/", "layout");
  return {};
}
