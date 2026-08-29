import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { iaLiberadaPara } from "@/lib/compras/ia-visao";
import { createClient } from "@/lib/supabase/server";

import { NotaForm } from "../nota-form";

export const metadata = {
  title: "Entrada por nota",
};

export default async function NovaCompraPage() {
  // A leitura por IA (G2d) está em teste e liberada só para as contas
  // listadas em variável de ambiente. Aqui a resposta serve só para MOSTRAR
  // ou esconder o botão — a permissão de verdade é conferida de novo na
  // server action, que é a fronteira.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const iaLiberada = user ? iaLiberadaPara(user.id) : false;

  return (
    <section className="minimal:max-sm:gap-4 mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/estoque"
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Voltar ao estoque
        </Link>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Entrada por nota
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-lg">
          Lance a nota da compra: o estoque entra, o custo de cada produto é
          atualizado e o valor da nota vira um gasto no Financeiro. Nada é
          gravado antes de você conferir.
        </p>
      </header>

      <NotaForm iaLiberada={iaLiberada} />
    </section>
  );
}
