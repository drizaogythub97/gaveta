import { LockKeyhole, Unlock } from "lucide-react";
import Link from "next/link";

import { CaixaFullscreenTip } from "@/components/app/caixa-fullscreen-tip";
import { listarTags } from "@/lib/products/tags";
import { createClient, obterUsuario } from "@/lib/supabase/server";
import { DEFAULT_FEES, type PaymentFees } from "@/lib/preferences/types";

import { loadPaymentFees } from "./actions";
import { PosClient } from "./pos-client";

export const metadata = {
  title: "Caixa",
};

export default async function CaixaPage() {
  const supabase = await createClient();
  // Mesma validação que o layout já fez nesta requisição — reaproveitada,
  // não repetida.
  const user = await obterUsuario();

  // Nenhuma destas quatro consultas depende da outra. Em série, cada uma
  // era uma viagem ao banco que a pessoa esperava antes de ver o caixa.
  const [dbFees, { data: openSession }, { data: prefs }, tags] =
    await Promise.all([
      loadPaymentFees(),
      supabase
        .from("cash_sessions")
        .select("id, opened_at")
        .eq("status", "open")
        .maybeSingle(),
      supabase
        .from("ecossistema_prefs")
        .select("fiado_pdv_ativo")
        .eq("user_id", user?.id ?? "")
        .maybeSingle(),
      // O produto cadastrado no caixa pode nascer já categorizado.
      listarTags(supabase),
    ]);
  const fees: PaymentFees = dbFees ?? DEFAULT_FEES;
  const fiadoPdvAtivo = Boolean(prefs?.fiado_pdv_ativo);

  return (
    // O caixa é a tela mais densa do sistema (duas colunas com números
    // grandes) e herdava o `max-w-5xl` do layout, apertando o total contra o
    // botão de registrar. A partir de 1280px ele toma a folga que a tela já
    // tem.
    //
    // O recuo é CONTADO, não escolhido no olho: a fonte base do sistema é
    // 18px (acessibilidade), então `-mx-16` vale 72px e não 64px. A 1280px o
    // `main` tem 1116px de conteúdo, e 1116 + 2×72 = 1260 cabe com 10px de
    // folga. O `-mx-24` que estava aqui valia 108px por lado: dava 1332px e
    // jogava 26px para fora da tela, com o título começando fora dela. Ver o
    // achado H de `docs/10-ACHADOS-DE-LOGICA.md`.
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6 xl:-mx-16 2xl:-mx-40">
      <header>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Frente de caixa
        </h1>
        <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
          Bipe ou busque produtos e registre a venda.
        </p>
      </header>

      <CashSessionBanner open={Boolean(openSession)} />

      <PosClient fees={fees} fiadoPdvAtivo={fiadoPdvAtivo} tags={tags} />
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
