import { CaixaFullscreenTip } from "@/components/app/caixa-fullscreen-tip";
import { DEFAULT_FEES, type PaymentFees } from "@/lib/preferences/types";

import { loadPaymentFees } from "./actions";
import { PosClient } from "./pos-client";

export const metadata = {
  title: "Caixa",
};

export default async function CaixaPage() {
  const dbFees = await loadPaymentFees();
  const fees: PaymentFees = dbFees ?? DEFAULT_FEES;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Frente de caixa
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Bipe ou busque produtos e registre a venda.
        </p>
      </header>
      <PosClient fees={fees} />
      <CaixaFullscreenTip />
    </section>
  );
}
