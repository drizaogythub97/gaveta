import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import type { CashMovement, CashSession } from "@/lib/types/cash";

import { SessionClient } from "./session-client";

export const metadata = {
  title: "Caixa — abertura e fechamento",
};

const SESSION_COLUMNS =
  "id, opened_at, opening_amount, closed_at, counted_amount, expected_amount, difference_amount, status, opening_note, closing_note";

export default async function CashSessionPage() {
  const supabase = await createClient();

  const { data: openRow } = await supabase
    .from("cash_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "open")
    .maybeSingle();
  const session = (openRow ?? null) as CashSession | null;

  let movements: CashMovement[] = [];
  let cashSalesTotal = 0;
  let cashSalesCount = 0;

  if (session) {
    const [{ data: movs }, { data: sales }] = await Promise.all([
      supabase
        .from("cash_movements")
        .select("id, session_id, type, amount, note, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sales")
        .select("total")
        .eq("cash_session_id", session.id)
        .eq("payment_method", "dinheiro")
        .eq("status", "completed"),
    ]);
    movements = (movs ?? []) as CashMovement[];
    const salesRows = (sales ?? []) as { total: number }[];
    cashSalesCount = salesRows.length;
    cashSalesTotal =
      Math.round(salesRows.reduce((s, r) => s + Number(r.total), 0) * 100) / 100;
  }

  const suprimentos = movements
    .filter((m) => m.type === "suprimento")
    .reduce((s, m) => s + Number(m.amount), 0);
  const sangrias = movements
    .filter((m) => m.type === "sangria")
    .reduce((s, m) => s + Number(m.amount), 0);
  const expected = session
    ? Math.round(
        (Number(session.opening_amount) +
          cashSalesTotal +
          suprimentos -
          sangrias) *
          100,
      ) / 100
    : 0;

  const { data: closedRows } = await supabase
    .from("cash_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(10);
  const closedSessions = (closedRows ?? []) as CashSession[];

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/caixa"
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Voltar à frente de caixa
        </Link>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Abertura e fechamento de caixa
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-lg">
          Abra o caixa com o troco inicial, registre retiradas (sangria) e
          reforços (suprimento) e, no fim do dia, confira o dinheiro contado com
          o esperado.
        </p>
      </header>

      <SessionClient
        session={session}
        movements={movements}
        cashSalesTotal={cashSalesTotal}
        cashSalesCount={cashSalesCount}
        suprimentos={Math.round(suprimentos * 100) / 100}
        sangrias={Math.round(sangrias * 100) / 100}
        expected={expected}
        closedSessions={closedSessions}
      />
    </section>
  );
}
