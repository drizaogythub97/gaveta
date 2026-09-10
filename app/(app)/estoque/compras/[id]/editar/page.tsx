import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { LinkAcao } from "@/components/app/link-acao";

import { listarTags } from "@/lib/products/tags";
import { createClient } from "@/lib/supabase/server";
import type { Purchase, PurchaseEdit } from "@/lib/types/purchases";

import { NotaForm } from "../../nota-form";

export const metadata = {
  title: "Corrigir nota",
};

/** Item da nota já gravado, com o produto que ele alimentou (quando há). */
type ItemGravado = {
  product_id: string | null;
  description_snapshot: string;
  barcode: string | null;
  quantity: number;
  unit_cost: number;
  products: { name: string; track_stock: boolean } | null;
};

export default async function CorrigirCompraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select(
      "id, supplier_name, access_key, issued_on, total, source, created_at, voided_at, edited_at",
    )
    .eq("id", id)
    .maybeSingle();

  const compra = data as Purchase | null;
  if (!compra) {
    notFound();
  }

  // Nota cancelada não se corrige — o caminho dela é relançar. A RPC também
  // barra; aqui é só para a pessoa não digitar uma tela inteira à toa.
  if (compra.voided_at !== null) {
    redirect(`/estoque/compras/${id}`);
  }

  const { data: itensData } = await supabase
    .from("purchase_items")
    .select(
      "product_id, description_snapshot, barcode, quantity, unit_cost, products(name, track_stock)",
    )
    .eq("purchase_id", id)
    .order("description_snapshot", { ascending: true });

  const itens = (itensData ?? []) as unknown as ItemGravado[];

  const edicao: PurchaseEdit = {
    purchaseId: compra.id,
    supplier: compra.supplier_name ?? "",
    issuedOn: compra.issued_on,
    accessKey: compra.access_key ?? "",
    itens: itens.map((item) => ({
      productId: item.product_id,
      // O nome mostrado é o do produto ATUAL (é ele que a correção
      // atualiza); a descrição da nota fica ao lado, para comparar.
      name: item.products?.name ?? item.description_snapshot,
      barcode: item.barcode ?? "",
      quantity: Number(item.quantity),
      unitCost: Number(item.unit_cost),
      trackStock: item.products?.track_stock ?? false,
      descricaoNota: item.description_snapshot,
    })),
  };

  const tags = await listarTags(supabase);

  return (
    <section className="minimal:max-sm:gap-4 mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <LinkAcao
          href={`/estoque/compras/${id}`}
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
          icone={<ArrowLeft aria-hidden="true" className="size-5" />}
        >
          Voltar à nota
        </LinkAcao>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Corrigir nota
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-lg">
          Ajuste o que saiu errado: valores, quantidades, fornecedor ou data. Ao
          salvar, o estoque anda só a diferença, o custo dos produtos é
          atualizado e o gasto no Financeiro é corrigido. As vendas já feitas
          não mudam.
        </p>
      </header>

      <NotaForm iaLiberada={false} tags={tags} edicao={edicao} />
    </section>
  );
}
