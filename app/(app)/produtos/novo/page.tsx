import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata = {
  title: "Novo produto — ERP Simples",
};

export default function NewProductPage() {
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
        submitLabel="Salvar produto"
        submitPendingLabel="Salvando…"
      />
    </section>
  );
}
