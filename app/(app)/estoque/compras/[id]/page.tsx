import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SuccessAlert } from "@/components/auth/form-feedback";

import { formatDateOnly } from "@/lib/dashboard/dates";
import { formatBRL, formatQuantity } from "@/lib/products/format";
import { createClient } from "@/lib/supabase/server";
import {
  PURCHASE_SOURCE_LABELS,
  type Purchase,
  type PurchaseItem,
} from "@/lib/types/purchases";

export const metadata = {
  title: "Nota lançada",
};

export default async function CompraDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const recemLancada = query.lancada === "1";

  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select(
      "id, supplier_name, access_key, issued_on, total, source, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const compra = data as Purchase | null;
  if (!compra) {
    notFound();
  }

  const { data: itensData } = await supabase
    .from("purchase_items")
    .select(
      "id, product_id, description_snapshot, barcode, quantity, unit_cost, line_total",
    )
    .eq("purchase_id", id)
    .order("description_snapshot", { ascending: true });

  const itens = (itensData ?? []) as PurchaseItem[];

  return (
    <section className="minimal:max-sm:gap-4 mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/estoque/compras"
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Voltar às notas
        </Link>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          {compra.supplier_name ?? "Fornecedor não informado"}
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-lg">
          Compra de {formatDateOnly(compra.issued_on)} ·{" "}
          {PURCHASE_SOURCE_LABELS[compra.source]} · {itens.length}{" "}
          {itens.length === 1 ? "item" : "itens"}
        </p>
      </header>

      {recemLancada ? (
        <SuccessAlert message="Nota lançada. O estoque já entrou, o custo dos produtos foi atualizado e o valor virou um gasto em insumos / mercadorias." />
      ) : null}

      <ul className="minimal:max-sm:gap-2 flex flex-col gap-3">
        {itens.map((item) => (
          <li
            key={item.id}
            className="ring-foreground/10 bg-card minimal:max-sm:p-3.5 flex flex-col gap-2 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="minimal:max-sm:text-base text-foreground text-lg font-semibold">
                {item.description_snapshot}
              </span>
              <span className="minimal:max-sm:text-xs text-muted-foreground text-base">
                {formatQuantity(item.quantity)} ×{" "}
                {formatBRL(item.unit_cost)} de custo
                {item.barcode ? (
                  <>
                    {" · "}
                    <span className="font-mono">{item.barcode}</span>
                  </>
                ) : null}
                {item.product_id === null
                  ? " · item não vinculado a um produto"
                  : ""}
              </span>
            </div>
            <span className="text-foreground text-lg font-semibold tabular-nums">
              {formatBRL(item.line_total)}
            </span>
          </li>
        ))}
      </ul>

      <div className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex items-center justify-between gap-3 rounded-xl p-5 ring-1">
        <span className="minimal:max-sm:text-base text-lg font-medium">
          Total da nota
        </span>
        <span className="minimal:max-sm:text-xl text-2xl font-semibold tabular-nums">
          {formatBRL(compra.total)}
        </span>
      </div>

      {compra.access_key ? (
        <p className="text-muted-foreground text-sm">
          Chave da nota:{" "}
          <span className="font-mono break-all">{compra.access_key}</span>
        </p>
      ) : null}
    </section>
  );
}
