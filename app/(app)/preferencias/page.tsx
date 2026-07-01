import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FEES, type PaymentFees } from "@/lib/preferences/types";
import type { ReceiptPaper, ReceiptPrefs } from "@/lib/receipt/types";

import { BrandSection } from "./sections/brand-section";
import { FeesSection } from "./sections/fees-section";
import { LogoSection } from "./sections/logo-section";
import { ReceiptSection } from "./sections/receipt-section";
import { ThemeSection } from "./sections/theme-section";

export const metadata = {
  title: "Preferências",
};

type ProfileRow = {
  brand_name: string | null;
  brand_logo_path: string | null;
  theme: "light" | "dark";
  receipt_paper: ReceiptPaper;
  receipt_show_logo: boolean;
  receipt_show_name: boolean;
  receipt_footer: string | null;
};

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: fees }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "brand_name, brand_logo_path, theme, receipt_paper, receipt_show_logo, receipt_show_name, receipt_footer",
      )
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
    receipt_paper: "80mm",
    receipt_show_logo: true,
    receipt_show_name: true,
    receipt_footer: null,
  }) as ProfileRow;
  const feesData = (fees ?? DEFAULT_FEES) as PaymentFees;
  const initialLogoUrl = profileData.brand_logo_path
    ? supabase.storage
        .from("brand-logos")
        .getPublicUrl(profileData.brand_logo_path).data.publicUrl
    : null;

  const receiptPrefs: ReceiptPrefs = {
    paper: profileData.receipt_paper,
    showLogo: profileData.receipt_show_logo,
    showName: profileData.receipt_show_name,
    footer: profileData.receipt_footer,
  };

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
      <ReceiptSection
        initialPrefs={receiptPrefs}
        brandName={profileData.brand_name}
        logoUrl={initialLogoUrl}
      />
      <FeesSection initialFees={feesData} />
    </section>
  );
}
