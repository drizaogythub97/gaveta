import { notFound } from "next/navigation";

import { caminhoDeVoltaSeguro } from "@/lib/nav/voltar";
import { listarTags } from "@/lib/products/tags";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";

import { type ProductFormState, updateProduct } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata = {
  title: "Editar produto",
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Quem chegou aqui pelo aviso do Fechamento volta para lá depois de
  // salvar, em vez de cair na lista de Produtos. O destino vem da URL, então
  // passa pelo filtro de alvo conhecido.
  const voltarPara = caminhoDeVoltaSeguro((await searchParams).voltar);
  const supabase = await createClient();
  const [{ data }, tags] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, user_id, name, price, cost_price, track_stock, stock_quantity, created_at, updated_at, product_barcodes(barcode), product_tag_links(tag_id)",
      )
      .eq("id", id)
      .maybeSingle(),
    listarTags(supabase),
  ]);

  const row = data as
    | (Product & {
        product_barcodes: { barcode: string }[] | null;
        product_tag_links: { tag_id: string }[] | null;
      })
    | null;
  if (!row) {
    notFound();
  }
  const product = {
    ...row,
    barcodes: (row.product_barcodes ?? []).map((b) => b.barcode),
    tagIds: (row.product_tag_links ?? []).map((l) => l.tag_id),
  };

  const boundAction = async (
    state: ProductFormState,
    formData: FormData,
  ): Promise<ProductFormState> => {
    "use server";
    return updateProduct(id, state, formData, voltarPara);
  };

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Editar produto
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Altere os campos e salve.
        </p>
      </header>
      <ProductForm
        action={boundAction}
        tags={tags}
        cancelarHref={voltarPara ?? "/produtos"}
        initialValues={{
          name: product.name,
          barcodes: product.barcodes,
          price: product.price,
          costPrice: product.cost_price,
          trackStock: product.track_stock ? "true" : "false",
          stockQuantity:
            product.stock_quantity === null
              ? ""
              : product.stock_quantity.toString().replace(".", ","),
          tagIds: product.tagIds,
        }}
        submitLabel="Salvar alterações"
        submitPendingLabel="Salvando…"
      />
    </section>
  );
}
