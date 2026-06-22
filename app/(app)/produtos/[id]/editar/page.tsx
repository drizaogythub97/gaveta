import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";

import { type ProductFormState, updateProduct } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata = {
  title: "Editar produto",
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, user_id, name, price, track_stock, stock_quantity, created_at, updated_at, product_barcodes(barcode)",
    )
    .eq("id", id)
    .maybeSingle();

  const row = data as
    | (Product & { product_barcodes: { barcode: string }[] | null })
    | null;
  if (!row) {
    notFound();
  }
  const product = {
    ...row,
    barcodes: (row.product_barcodes ?? []).map((b) => b.barcode),
  };

  const boundAction = async (
    state: ProductFormState,
    formData: FormData,
  ): Promise<ProductFormState> => {
    "use server";
    return updateProduct(id, state, formData);
  };

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Editar produto</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Altere os campos e salve.
        </p>
      </header>
      <ProductForm
        action={boundAction}
        initialValues={{
          name: product.name,
          barcodes: product.barcodes,
          price: product.price,
          trackStock: product.track_stock ? "true" : "false",
          stockQuantity:
            product.stock_quantity === null
              ? ""
              : product.stock_quantity.toString().replace(".", ","),
        }}
        submitLabel="Salvar alterações"
        submitPendingLabel="Salvando…"
      />
    </section>
  );
}
