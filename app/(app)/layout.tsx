import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/app/app-nav";
import { AppSwitcher } from "@/components/app/app-switcher";
import { BottomNav } from "@/components/app/bottom-nav";
import { LogoutButton } from "@/components/app/logout-button";
import { ModoChooser } from "@/components/app/modo-chooser";
import { PersonalizationTip } from "@/components/app/personalization-tip";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";
import { getUiModeFromCookie } from "@/lib/ui-mode/cookie";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("brand_name, brand_logo_path")
    .eq("id", user.id)
    .maybeSingle();

  const customName = (profile?.brand_name as string | null) ?? null;
  const logoPath = profile?.brand_logo_path as string | null;
  const logoUrl = logoPath
    ? supabase.storage.from("brand-logos").getPublicUrl(logoPath).data.publicUrl
    : null;

  // Sem personalização, o cabeçalho volta à marca padrão do produto: "Gaveta".
  const brandName = customName ?? "Gaveta";
  const isPersonalized = Boolean(customName) || Boolean(logoPath);

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email;

  const uiMode = await getUiModeFromCookie();

  // Atalho do ecossistema (opt-in, estágio 1): só aparece se o usuário
  // ligou o toggle em /ecossistema. A pref vale a conta (os dois apps).
  const { data: ecoPrefs } = await supabase
    .from("ecossistema_prefs")
    .select("switcher_ativo")
    .eq("user_id", user.id)
    .maybeSingle();
  const mostrarSwitcher = Boolean(ecoPrefs?.switcher_ativo);

  return (
    <div className="flex min-h-screen flex-col">
      {/* No modo Minimalista (só mobile) o header encolhe, o Sair migra para
          o painel "Mais" da barra inferior e a nav do topo some. */}
      <header className="border-border bg-background border-b print:hidden">
        <div className="minimal:max-sm:h-12 mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <Link
            href="/dashboard"
            className="minimal:max-sm:text-lg text-foreground flex items-center gap-3 text-xl font-semibold tracking-tight"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="minimal:max-sm:size-8 size-10 rounded-md object-cover"
              />
            ) : (
              <>
                {/* Logo padrão Gaveta: colorida no claro, branca no escuro. */}
                <Image
                  src="/logo-mark.png"
                  alt=""
                  width={40}
                  height={40}
                  className="minimal:max-sm:size-8 size-10 object-contain dark:hidden"
                />
                <Image
                  src="/logo-mono-white.png"
                  alt=""
                  width={40}
                  height={40}
                  className="minimal:max-sm:size-8 hidden size-10 object-contain dark:block"
                />
              </>
            )}
            <span>{brandName}</span>
          </Link>
          <div className="minimal:max-sm:hidden flex items-center gap-2">
            <span
              className="text-muted-foreground hidden text-base sm:inline"
              aria-label="Usuário conectado"
            >
              {displayName}
            </span>
            {mostrarSwitcher ? <AppSwitcher /> : null}
            <LogoutButton />
          </div>
        </div>
        <AppNav />
      </header>
      <main className="minimal:max-sm:py-4 minimal:max-sm:pb-24 mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <BottomNav
        displayName={displayName ?? ""}
        mostrarSwitcher={mostrarSwitcher}
      />
      {uiMode === null ? <ModoChooser /> : null}
      <Toaster />
      <PersonalizationTip isPersonalized={isPersonalized} />
    </div>
  );
}
