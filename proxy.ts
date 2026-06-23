import { type NextRequest } from "next/server";

import { buildCsp } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Nonce unico por requisicao para a CSP. O Next aplica esse nonce aos seus
  // proprios scripts ao ler o header `x-nonce` da requisicao.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas exceto:
     * - _next/static (assets gerados)
     * - _next/image (otimizacao de imagem)
     * - favicon.ico, robots.txt, sitemap.xml
     * - arquivos com extensoes de imagem
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
