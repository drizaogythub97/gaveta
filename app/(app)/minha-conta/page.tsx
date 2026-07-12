import { createClient } from "@/lib/supabase/server";

import { AccountClient } from "./account-client";

export const metadata = {
  title: "Minha conta",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, privacy_accepted_at, created_at")
    .eq("id", user!.id)
    .maybeSingle();

  const fullName =
    (profile?.full_name as string | null) ??
    ((user?.user_metadata?.full_name as string | undefined) ?? "");
  const email = user?.email ?? "";
  const createdAt = (profile?.created_at as string | null) ?? null;
  const privacyAcceptedAt =
    (profile?.privacy_accepted_at as string | null) ?? null;

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">Minha conta</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Seus dados pessoais. Você pode editar o nome e, se quiser, excluir
          definitivamente a conta.
        </p>
      </header>
      <AccountClient
        initialFullName={fullName}
        email={email}
        createdAt={createdAt}
        privacyAcceptedAt={privacyAcceptedAt}
      />
    </section>
  );
}
