import { FileText, History } from "lucide-react";

import { LinkAcao } from "@/components/app/link-acao";

import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";

import { InventoryClient, type ProductWithBarcodes } from "./inventory-client";

export const metadata = {
  title: "Estoque",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, user_id, name, price, cost_price, track_stock, stock_quantity, created_at, updated_at, product_barcodes(barcode)",
    )
    .eq("track_stock", true)
    .order("name", { ascending: true });

  // Os códigos vêm junto porque a busca da tela casa por nome OU por código:
  // é o que permite achar o produto bipando com a câmera.
  type ProductRow = Product & {
    product_barcodes: { barcode: string }[] | null;
  };
  const products: ProductWithBarcodes[] = ((data ?? []) as ProductRow[]).map(
    (p) => ({ ...p, barcodes: (p.product_barcodes ?? []).map((b) => b.barcode) }),
  );

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">Estoque</h1>
          <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
            Atualize quantidades e registre entradas dos produtos que você
            controla por estoque. Itens sob demanda ficam em{" "}
            <span className="text-foreground font-medium">Produtos</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkAcao
            href="/estoque/compras/nova"
            className="border-border hover:bg-muted inline-flex h-12 w-fit shrink-0 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors sm:flex-initial"
            icone={<FileText aria-hidden="true" className="size-5" />}
          >
            Entrada por nota
          </LinkAcao>
          <LinkAcao
            href="/estoque/movimentacoes"
            className="border-border hover:bg-muted inline-flex h-12 w-fit shrink-0 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors sm:flex-initial"
            icone={<History aria-hidden="true" className="size-5" />}
          >
            Ver movimentação
          </LinkAcao>
        </div>
      </header>
      <InventoryClient products={products} />
    </section>
  );
}
