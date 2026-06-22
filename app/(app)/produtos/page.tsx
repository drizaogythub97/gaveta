import { Box, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL, formatQuantity } from "@/lib/products/format";
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductWithBarcodes } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import { deleteProduct } from "./actions";

export const metadata = {
  title: "Produtos",
};

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, user_id, name, price, track_stock, stock_quantity, created_at, updated_at, product_barcodes(barcode)",
    )
    .order("created_at", { ascending: false });

  const products: ProductWithBarcodes[] = (
    (data ?? []) as (Product & {
      product_barcodes: { barcode: string }[] | null;
    })[]
  ).map((p) => ({
    ...p,
    barcodes: (p.product_barcodes ?? []).map((b) => b.barcode),
  }));

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Cadastre e organize o que você vende.
          </p>
        </div>
        <Link
          href="/produtos/novo"
          className={cn(
            buttonVariants(),
            "h-14 px-6 text-lg font-medium sm:self-start",
          )}
        >
          <Plus aria-hidden="true" className="size-5" />
          Novo produto
        </Link>
      </header>

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar os produtos.
        </p>
      ) : products.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-foreground text-xl font-semibold">
                    {p.name}
                  </span>
                  <StockBadge product={p} />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
                  <span className="text-foreground text-lg font-medium">
                    {formatBRL(p.price)}
                  </span>
                  {p.barcodes.length > 0 ? (
                    <span aria-label={`Códigos de barras ${p.barcodes.join(", ")}`}>
                      {p.barcodes.length === 1 ? "Código: " : "Códigos: "}
                      <span className="font-mono">
                        {p.barcodes.join(" · ")}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/produtos/${p.id}/editar`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-12 px-4 text-base",
                  )}
                  aria-label={`Editar ${p.name}`}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Editar
                </Link>
                <ConfirmDeleteButton
                  id={p.id}
                  productName={p.name}
                  action={deleteProduct}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="bg-muted/40 flex flex-col items-center gap-3 rounded-xl p-10 text-center">
      <Box aria-hidden="true" className="text-muted-foreground size-10" />
      <h2 className="text-xl font-medium">Nenhum produto cadastrado ainda</h2>
      <p className="text-muted-foreground text-base">
        Crie seu primeiro produto para começar a vender.
      </p>
      <Link
        href="/produtos/novo"
        className={cn(buttonVariants(), "mt-2 h-14 px-6 text-lg font-medium")}
      >
        <Plus aria-hidden="true" className="size-5" />
        Cadastrar produto
      </Link>
    </div>
  );
}

function StockBadge({ product }: { product: Product }) {
  if (!product.track_stock) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
        aria-label="Produto sob demanda, sem controle de estoque"
      >
        <UtensilsCrossed aria-hidden="true" className="size-4" />
        Sob demanda
      </span>
    );
  }

  const qty = product.stock_quantity ?? 0;
  return (
    <span
      className="bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
      aria-label={`Estoque: ${formatQuantity(qty)}`}
    >
      <Box aria-hidden="true" className="size-4" />
      Estoque: {formatQuantity(qty)}
    </span>
  );
}
