import { ArrowLeft, FileText, Plus } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dashboard/dates";
import { formatBRL } from "@/lib/products/format";
import { createClient } from "@/lib/supabase/server";
import { PURCHASE_SOURCE_LABELS, type Purchase } from "@/lib/types/purchases";
import { cn } from "@/lib/utils";

import { NotaCanceladaBadge } from "./nota-cancelada-badge";

export const metadata = {
  title: "Notas lançadas",
};

const LIMITE = 100;

type PurchaseRow = Purchase & { purchase_items: { count: number }[] };

export default async function ComprasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, supplier_name, access_key, issued_on, total, source, created_at, voided_at, purchase_items(count)",
    )
    .order("issued_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  const compras = (data ?? []) as unknown as PurchaseRow[];

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/estoque"
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Voltar ao estoque
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
              Notas lançadas
            </h1>
            <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
              As compras que você já registrou. Mostrando as {LIMITE} mais
              recentes.
            </p>
          </div>
          <Link
            href="/estoque/compras/nova"
            className={cn(
              buttonVariants(),
              "minimal:max-sm:h-11 minimal:max-sm:text-base h-14 px-6 text-lg font-medium sm:self-start",
            )}
          >
            <Plus aria-hidden="true" className="size-5" />
            Lançar nota
          </Link>
        </div>
      </header>

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar as notas.
        </p>
      ) : compras.length === 0 ? (
        <div className="minimal:max-sm:p-6 bg-muted/40 flex flex-col items-center gap-3 rounded-xl p-10 text-center">
          <FileText
            aria-hidden="true"
            className="text-muted-foreground size-10"
          />
          <h2 className="minimal:max-sm:text-base text-xl font-medium">
            Nenhuma nota lançada ainda
          </h2>
          <p className="text-muted-foreground text-base">
            Ao lançar a nota de uma compra, o estoque entra e o custo dos
            produtos fica em dia.
          </p>
        </div>
      ) : (
        <ul className="minimal:max-sm:gap-2 flex flex-col gap-3">
          {compras.map((compra) => {
            const itens = compra.purchase_items?.[0]?.count ?? 0;
            const cancelada = compra.voided_at !== null;
            return (
              <li key={compra.id}>
                <Link
                  href={`/estoque/compras/${compra.id}`}
                  className="ring-foreground/10 bg-card hover:bg-muted/50 minimal:max-sm:p-3.5 flex flex-col gap-2 rounded-xl p-4 ring-1 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <span className="minimal:max-sm:text-base text-foreground flex flex-wrap items-center gap-2 text-xl font-semibold">
                      {compra.supplier_name ?? "Fornecedor não informado"}
                      {cancelada ? <NotaCanceladaBadge /> : null}
                    </span>
                    <span className="minimal:max-sm:text-xs text-muted-foreground text-base">
                      {formatDateOnly(compra.issued_on)} · {itens}{" "}
                      {itens === 1 ? "item" : "itens"} ·{" "}
                      {PURCHASE_SOURCE_LABELS[compra.source]}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "minimal:max-sm:text-lg text-xl font-semibold tabular-nums",
                      cancelada
                        ? "text-muted-foreground line-through"
                        : "text-foreground",
                    )}
                  >
                    {formatBRL(compra.total)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
