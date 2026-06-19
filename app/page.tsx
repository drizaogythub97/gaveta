import { createClient } from "@/lib/supabase/server";

async function checkSupabaseConnection(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();
    if (error && error.status && error.status >= 500) {
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export default async function Home() {
  const status = await checkSupabaseConnection();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">ERP Simples</h1>
      <p className="text-muted-foreground text-xl">
        Sistema em construção. Estamos preparando o seu cadastro de produtos,
        frente de caixa e relatórios de faturamento.
      </p>

      <div
        className="bg-muted text-foreground flex items-center gap-3 rounded-lg px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <span
          className={
            status.ok
              ? "bg-success inline-block h-3 w-3 rounded-full"
              : "bg-destructive inline-block h-3 w-3 rounded-full"
          }
          aria-hidden="true"
        />
        <span className="text-base">
          {status.ok
            ? "Conectado ao Supabase."
            : `Falha ao conectar ao Supabase: ${status.reason}`}
        </span>
      </div>
    </main>
  );
}
