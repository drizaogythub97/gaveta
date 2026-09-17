import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `rls-${label}-${stamp}@example.com`;
  const password = `Test-${Math.random().toString(36).slice(2, 12)}!`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `Tester ${label}`,
        privacy_accepted: "true",
      },
    });
  if (createError || !created.user) {
    throw new Error(
      `Falha ao criar usuario ${label}: ${createError?.message ?? "sem user"}`,
    );
  }

  const anonForLogin = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signed, error: signError } =
    await anonForLogin.auth.signInWithPassword({ email, password });
  if (signError || !signed.session) {
    throw new Error(
      `Falha ao logar usuario ${label}: ${signError?.message ?? "sem sessao"}`,
    );
  }

  return {
    id: created.user.id,
    email,
    password,
    accessToken: signed.session.access_token,
  };
}

export async function deleteTestUser(user: Pick<User, "id">): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(user.id);
}

/**
 * Padrão dos e-mails das contas descartáveis criadas por {@link createTestUser}.
 * Serve de trava: a limpeza automática só apaga o que casa com isto.
 */
const PADRAO_CONTA_DE_TESTE = /^(rls|perf)-[a-z0-9-]+@example\.com$/i;

/** Idade mínima para uma conta descartável ser considerada sobra. */
const HORAS_ATE_VIRAR_SOBRA = 24;

/**
 * Apaga contas descartáveis que ficaram para trás.
 *
 * O `teardown` só apaga quando a suíte chega ao fim: execução interrompida
 * (Ctrl+C, queda de energia, falha no meio) deixa a conta no banco para
 * sempre. Em 16/09/2026 havia 200 sobrando — ver o achado 5 de
 * `docs/12-VARREDURA-DE-SEGURANCA-2026-09.md`.
 *
 * Duas travas para nunca encostar numa conta real:
 *
 * 1. o e-mail tem de casar {@link PADRAO_CONTA_DE_TESTE};
 * 2. a conta tem de ter mais de {@link HORAS_ATE_VIRAR_SOBRA} horas, para
 *    não apagar a conta de uma suíte rodando em paralelo agora.
 *
 * Nunca lança: limpeza é higiene, não pode derrubar a suíte.
 */
export async function limparContasDeTesteAntigas(): Promise<number> {
  const admin = adminClient();
  const limite = Date.now() - HORAS_ATE_VIRAR_SOBRA * 60 * 60 * 1000;
  let apagadas = 0;

  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error || !data?.users?.length) break;

      for (const user of data.users) {
        const email = user.email ?? "";
        if (!PADRAO_CONTA_DE_TESTE.test(email)) continue;
        if (new Date(user.created_at).getTime() > limite) continue;
        const { error: falha } = await admin.auth.admin.deleteUser(user.id);
        if (!falha) apagadas += 1;
      }

      if (data.users.length < 1000) break;
    }
  } catch {
    // Higiene não derruba a suíte.
  }

  return apagadas;
}
