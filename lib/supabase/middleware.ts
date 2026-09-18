import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/recover",
  "/privacidade",
  "/auth",
];

const AUTH_ONLY_PREFIXES = ["/login", "/signup"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isAuthOnly(pathname: string) {
  return AUTH_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      // Mesmas opções do cliente de servidor (`lib/supabase/server.ts`): as
      // duas pontas têm de gravar o cookie igual, senão o refresh do proxy
      // reescreveria o cookie sem as travas.
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Reflete os cookies refrescados nos headers encaminhados ao render,
          // para que os Server Components vejam a sessao atualizada.
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // A sessão é VERIFICADA aqui, não apenas lida: `getClaims()` confere a
  // assinatura do token com a chave pública do projeto (ES256, publicada em
  // /auth/v1/.well-known/jwks.json e guardada em cache). É o que a própria
  // Supabase recomenda para o middleware desde as chaves assimétricas.
  //
  // Por que não `getUser()` aqui: ele é uma chamada HTTP ao Auth em TODA
  // requisição — cada página, cada navegação interna, cada busca do caixa.
  // A conferência com estado (sessão apagada, usuário removido) continua
  // acontecendo uma vez por página no layout autenticado, via
  // `obterUsuario()`; e o banco valida a assinatura em toda consulta pela
  // RLS. O que este arquivo decide é só "pode entrar ou vai para o login".
  //
  // Nunca `getSession()`: ele devolve o que está no cookie sem conferir nada.
  //
  // Token vencido: `getClaims()` renova a sessão pelo refresh token antes de
  // verificar, e o `setAll` acima devolve os cookies novos ao navegador — o
  // refresh silencioso continua sendo papel do proxy.
  const { data, error } = await supabase.auth.getClaims();
  let user = !error && data?.claims?.sub ? { id: data.claims.sub } : null;

  const { pathname, search } = request.nextUrl;

  // A raiz não mostra nada: ela existe só para mandar a pessoa ao lugar
  // certo. Decidir aqui, com a sessão que ESTA requisição já verificou,
  // evita renderizar uma página e pedir o usuário ao Auth de novo só para
  // depois responder um redirecionamento.
  //
  // Vale principalmente para o app instalado no celular: o atalho da tela
  // inicial aponta para a raiz, e no celular cada ida e volta custa a
  // latência inteira da rede. O `start_url` do manifesto já vai direto ao
  // painel, mas o app Android (TWA) tem a URL de abertura gravada dentro
  // dele e continua entrando por aqui.
  if (pathname === "/") {
    const destino = request.nextUrl.clone();
    destino.pathname = user ? "/dashboard" : "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  // Em /login e /signup — e SÓ aqui — a conferência é com estado, como era.
  //
  // É o que fecha o laço da sessão revogada: o layout autenticado, ao ver
  // que a sessão morreu no Auth (Sair em outro aparelho, conta apagada),
  // manda para /login; se este proxy olhasse só a assinatura, mandaria de
  // volta para /dashboard, e o navegador acabaria em "muitos
  // redirecionamentos" em vez de na tela de entrar. Provado localmente
  // antes desta conferência existir. Como quem já está logado raramente
  // pede /login, a viagem ao Auth aqui não pesa em nada; e quando a sessão
  // de fato morreu, os cookies velhos são limpos para a tela de entrar
  // nascer limpa.
  if (user && isAuthOnly(pathname)) {
    const {
      data: { user: vivo },
    } = await supabase.auth.getUser();
    if (!vivo) {
      await supabase.auth.signOut({ scope: "local" });
      user = null;
    }
  }

  if (!user && !isPublic(pathname) && pathname !== "/") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthOnly(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
