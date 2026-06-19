import { PosClient } from "./pos-client";

export const metadata = {
  title: "Caixa — ERP Simples",
};

export default function CaixaPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Frente de caixa
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Bipe ou busque produtos e registre a venda.
        </p>
      </header>
      <PosClient />
    </section>
  );
}
