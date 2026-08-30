import { listarTags } from "@/lib/products/tags";
import { createClient } from "@/lib/supabase/server";

import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata = {
  title: "Novo produto",
};

export default async function NewProductPage() {
  const supabase = await createClient();
  const tags = await listarTags(supabase);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Novo produto</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Preencha os campos abaixo para cadastrar.
        </p>
      </header>
      <ProductForm
        action={createProduct}
        tags={tags}
        submitLabel="Salvar produto"
        submitPendingLabel="Salvando…"
      />
    </section>
  );
}
