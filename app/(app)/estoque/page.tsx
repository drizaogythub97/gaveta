import { History } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";

import { InventoryClient } from "./inventory-client";

export const metadata = {
  title: "Estoque",
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, user_id, name, price, track_stock, stock_quantity, created_at, updated_at",
    )
    .eq("track_stock", true)
    .order("name", { ascending: true });

  const products = (data ?? []) as Product[];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Atualize quantidades e registre entradas dos produtos que você
            controla por estoque. Itens sob demanda ficam em{" "}
            <span className="text-foreground font-medium">Produtos</span>.
          </p>
        </div>
        <Link
          href="/estoque/movimentacoes"
          className="border-border hover:bg-muted inline-flex h-12 w-fit shrink-0 items-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors"
        >
          <History aria-hidden="true" className="size-5" />
          Ver movimentação
        </Link>
      </header>
      <InventoryClient products={products} />
    </section>
  );
}
