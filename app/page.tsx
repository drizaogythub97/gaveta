import { redirect } from "next/navigation";

import { obterUsuario } from "@/lib/supabase/server";

/**
 * Raiz do site.
 *
 * Na prática esta página não é alcançada: o `proxy.ts` resolve a raiz antes,
 * com a sessão que ele já verificou, e responde o redirecionamento sem
 * renderizar nada — é uma ida e volta a menos na abertura do app no celular.
 *
 * Ela fica como rede de segurança: se um dia o matcher do proxy mudar e a
 * raiz deixar de passar por lá, o destino continua o mesmo em vez de virar
 * um 404.
 */
export default async function Home() {
  const user = await obterUsuario();

  redirect(user ? "/dashboard" : "/login");
}
