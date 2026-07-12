import { LockKeyhole, Unlock } from "lucide-react";
import Link from "next/link";

import { CaixaFullscreenTip } from "@/components/app/caixa-fullscreen-tip";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_FEES, type PaymentFees } from "@/lib/preferences/types";

import { loadPaymentFees } from "./actions";
import { PosClient } from "./pos-client";

export const metadata = {
  title: "Caixa",
};

export default async function CaixaPage() {
  const dbFees = await loadPaymentFees();
  const fees: PaymentFees = dbFees ?? DEFAULT_FEES;

  const supabase = await createClient();
  const { data: openSession } = await supabase
    .from("cash_sessions")
    .select("id, opened_at")
    .eq("status", "open")
    .maybeSingle();

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Frente de caixa
        </h1>
        <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
          Bipe ou busque produtos e registre a venda.
        </p>
      </header>

      <CashSessionBanner open={Boolean(openSession)} />

      <PosClient fees={fees} />
      <CaixaFullscreenTip />
    </section>
  );
}

function CashSessionBanner({ open }: { open: boolean }) {
  return (
    <Link
      href="/caixa/sessao"
      className={
        open
          ? "bg-success/10 text-success flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-medium hover:opacity-90"
          : "bg-muted text-foreground flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-medium hover:opacity-90"
      }
    >
      <span className="flex items-center gap-2">
        {open ? (
          <Unlock aria-hidden="true" className="size-5" />
        ) : (
          <LockKeyhole aria-hidden="true" className="size-5" />
        )}
        {open
          ? "Caixa aberto — vendas em dinheiro entram nesta sessão."
          : "Caixa fechado. Abra o caixa para controlar o dinheiro do dia."}
      </span>
      <span className="underline underline-offset-4">
        {open ? "Gerenciar / fechar" : "Abrir caixa"}
      </span>
    </Link>
  );
}
