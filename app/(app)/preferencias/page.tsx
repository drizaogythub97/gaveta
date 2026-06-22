import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FEES, type PaymentFees } from "@/lib/preferences/types";

import { BrandSection } from "./sections/brand-section";
import { FeesSection } from "./sections/fees-section";
import { LogoSection } from "./sections/logo-section";
import { ThemeSection } from "./sections/theme-section";

export const metadata = {
  title: "Preferências",
};

type ProfileRow = {
  brand_name: string | null;
  brand_logo_path: string | null;
  theme: "light" | "dark";
};

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: fees }] = await Promise.all([
    supabase
      .from("profiles")
      .select("brand_name, brand_logo_path, theme")
      .eq("id", user!.id)
      .maybeSingle(),
    supabase
      .from("preferences_fees")
      .select(
        "pix_pct, debito_pct, credito_avista_pct, credito_parcelado_base_pct, credito_parcelado_por_parcela_pct, vale_pct",
      )
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  const profileData = (profile ?? {
    brand_name: null,
    brand_logo_path: null,
    theme: "light",
  }) as ProfileRow;
  const feesData = (fees ?? DEFAULT_FEES) as PaymentFees;
  const initialLogoUrl = profileData.brand_logo_path
    ? supabase.storage
        .from("brand-logos")
        .getPublicUrl(profileData.brand_logo_path).data.publicUrl
    : null;

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Preferências</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Ajuste a aparência, as taxas das maquininhas e a identidade do seu
          negócio.
        </p>
      </header>

      <ThemeSection currentTheme={profileData.theme} />
      <BrandSection initialName={profileData.brand_name ?? ""} />
      <LogoSection initialLogoUrl={initialLogoUrl} />
      <FeesSection initialFees={feesData} />
    </section>
  );
}
