import { notFound, redirect } from "next/navigation";

import { Receipt } from "@/components/receipt/receipt";
import { createClient } from "@/lib/supabase/server";
import {
  type ReceiptData,
  type ReceiptPaper,
  type ReceiptPrefs,
} from "@/lib/receipt/types";
import type { PaymentMethod } from "@/app/(app)/caixa/actions";

import { PrintToolbar } from "./auto-print-client";
import styles from "./print-page.module.css";

export const metadata = {
  title: "Comprovante",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Regras de @page por formato de papel. Bobina usa margem 0 e altura
// automática; A4 usa margens confortáveis de folha. A margem do body é
// zerada na impressão (senão a bobina de 80/58 mm estoura a largura e gera
// uma página em branco extra).
const PAGE_SIZE: Record<ReceiptPaper, string> = {
  "80mm": "size: 80mm auto; margin: 0;",
  "58mm": "size: 58mm auto; margin: 0;",
  a4: "size: A4; margin: 12mm;",
};

function buildPrintCss(paper: ReceiptPaper): string {
  return [
    `@page { ${PAGE_SIZE[paper]} }`,
    "@media print { html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; } }",
  ].join("\n");
}

type ProfileRow = {
  brand_name: string | null;
  brand_logo_path: string | null;
  receipt_paper: ReceiptPaper;
  receipt_show_logo: boolean;
  receipt_show_name: boolean;
  receipt_footer: string | null;
};

type SaleItemRow = {
  name_snapshot: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type SaleRow = {
  id: string;
  total: number;
  status: "completed" | "voided";
  payment_method: PaymentMethod;
  installments: number | null;
  discount_amount: number;
  created_at: string;
  sale_items: SaleItemRow[];
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  if (!UUID_RE.test(saleId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS garante que só a venda do próprio usuário é retornada.
  const { data: saleData } = await supabase
    .from("sales")
    .select(
      "id, total, status, payment_method, installments, discount_amount, created_at, sale_items(name_snapshot, unit_price, quantity, line_total)",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (!saleData) notFound();
  const sale = saleData as SaleRow;

  const { data: profileData } = await supabase
    .from("profiles")
    .select(
      "brand_name, brand_logo_path, receipt_paper, receipt_show_logo, receipt_show_name, receipt_footer",
    )
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? {
    brand_name: null,
    brand_logo_path: null,
    receipt_paper: "80mm",
    receipt_show_logo: true,
    receipt_show_name: true,
    receipt_footer: null,
  }) as ProfileRow;

  const logoUrl = profile.brand_logo_path
    ? supabase.storage
        .from("brand-logos")
        .getPublicUrl(profile.brand_logo_path).data.publicUrl
    : null;

  const subtotal =
    Math.round(
      sale.sale_items.reduce((sum, it) => sum + Number(it.line_total), 0) * 100,
    ) / 100;
  const discount = Math.round(Number(sale.discount_amount) * 100) / 100;

  const data: ReceiptData = {
    id: sale.id,
    createdAt: sale.created_at,
    status: sale.status,
    paymentMethod: sale.payment_method,
    installments: sale.installments,
    subtotal,
    discount,
    total: Math.round(Number(sale.total) * 100) / 100,
    items: sale.sale_items.map((it) => ({
      name: it.name_snapshot,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
      lineTotal: Number(it.line_total),
    })),
  };

  const prefs: ReceiptPrefs = {
    paper: profile.receipt_paper,
    showLogo: profile.receipt_show_logo,
    showName: profile.receipt_show_name,
    footer: profile.receipt_footer,
  };

  return (
    <>
      {/* style-src permite 'unsafe-inline' → @page dinâmico sem nonce. */}
      <style>{buildPrintCss(prefs.paper)}</style>
      <div className={styles.screen}>
        <PrintToolbar />
        {/* Sem largura fixa: no flex centralizado o papel encolhe ao conteúdo
            (80/58 mm) ou ao max-width do A4, imprimindo sem overflow. */}
        <div className={styles.paper}>
          <Receipt
            data={data}
            prefs={prefs}
            brand={{ name: profile.brand_name, logoUrl }}
          />
        </div>
      </div>
    </>
  );
}
