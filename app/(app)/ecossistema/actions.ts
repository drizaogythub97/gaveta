"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
