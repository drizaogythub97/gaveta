import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";

import { InventoryClient } from "./inventory-client";

export const metadata = {
  title: "Estoque — ERP Simples",
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
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Estoque</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Atualize quantidades e registre entradas dos produtos que você
          controla por estoque. Itens sob demanda ficam em{" "}
          <span className="text-foreground font-medium">Produtos</span>.
        </p>
      </header>
      <InventoryClient products={products} />
    </section>
  );
}
