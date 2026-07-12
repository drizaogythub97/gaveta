import { notFound, redirect } from "next/navigation";

import { Receipt } from "@/components/receipt/receipt";
import { carregarComprovante } from "@/lib/receipt/data";
import { type ReceiptPaper } from "@/lib/receipt/types";

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

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  if (!UUID_RE.test(saleId)) notFound();

  // Loader único: mesmas queries da server action de emissão direta.
  const result = await carregarComprovante(saleId);
  if (!result.ok) {
    if (result.motivo === "auth") redirect("/login");
    notFound();
  }
  const { data, prefs, brand } = result.comprovante;

  return (
    <>
      {/* style-src permite 'unsafe-inline' → @page dinâmico sem nonce. */}
      <style>{buildPrintCss(prefs.paper)}</style>
      <div className={styles.screen}>
        <PrintToolbar />
        {/* Sem largura fixa: no flex centralizado o papel encolhe ao conteúdo
            (80/58 mm) ou ao max-width do A4, imprimindo sem overflow. */}
        <div className={styles.paper}>
          <Receipt data={data} prefs={prefs} brand={brand} />
        </div>
      </div>
    </>
  );
}
