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
