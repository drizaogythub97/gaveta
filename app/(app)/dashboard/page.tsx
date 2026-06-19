import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Painel — ERP Simples",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const greeting =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Olá, {greeting}!
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Sua conta está pronta. Em breve você poderá cadastrar produtos,
          registrar vendas e ver seus relatórios.
        </p>
      </header>
    </section>
  );
}
