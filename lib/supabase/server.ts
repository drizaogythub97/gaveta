import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { publicEnv } from "@/lib/env";

/**
 * Cliente do Supabase do lado do servidor — UM por requisição.
 *
 * O `cache` do React guarda o resultado pela duração da requisição: layout,
 * página e o que mais rodar no mesmo render recebem a mesma instância, em
 * vez de cada um montar a sua lendo os cookies de novo. Fora de um render
 * (Server Action, Route Handler) o `cache` simplesmente não guarda nada e a
 * função se comporta como antes.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    /**
     * O cookie de sessão é escondido do JavaScript da página.
     *
     * `httpOnly`: o token deixa de ser legível por `document.cookie`. A CSP
     * estrita já torna um XSS improvável; esta é a segunda tranca, para o
     * dia em que a primeira falhar. Nada quebra porque o Gaveta não usa
     * cliente do Supabase no navegador — quem fala com o banco é sempre o
     * servidor. Os cookies do PRÓPRIO app (tema, modo de exibição, aviso
     * do ecossistema) não passam por aqui e continuam legíveis, que é o
     * que sustenta o script anti-piscada.
     *
     * `secure` só em produção: em desenvolvimento o servidor é http, e um
     * cookie `Secure` seria descartado pelo navegador — a suíte e2e local
     * não conseguiria entrar.
     *
     * Ver o achado 2 de `docs/12-VARREDURA-DE-SEGURANCA-2026-09.md`.
     */
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components nao podem escrever cookies; o middleware
          // garante o refresh da sessao a cada navegacao.
        }
      },
    },
  });
});

/**
 * O usuário da sessão, validado no servidor do Auth — UMA vez por requisição.
 *
 * `getUser()` é uma chamada de rede ao Auth do Supabase. Antes, o layout, a
 * página e as funções que ela chamava faziam cada um a sua: abrir o caixa
 * validava a mesma sessão quatro vezes em série. Com o `cache`, a primeira
 * chamada viaja e as demais reaproveitam a resposta dentro da mesma
 * requisição. Continua sendo `getUser()` (nunca `getSession()`): a
 * validação é a mesma, só não se repete.
 */
export const obterUsuario = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
