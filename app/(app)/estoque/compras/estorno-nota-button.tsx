"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";

import { estornarCompra } from "./actions";

/**
 * Cancelar (estornar) uma nota lançada por engano — fase G2a.1. A nota não
 * é apagada: os efeitos são desfeitos e ela fica marcada como cancelada.
 * O diálogo explica em palavras simples o que vai acontecer, porque a ação
 * não tem volta.
 */
export function EstornoNotaButton({
  purchaseId,
  fornecedor,
}: {
  purchaseId: string;
  fornecedor: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancelar() {
    startTransition(async () => {
      const result = await estornarCompra(purchaseId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const avisos: string[] = [];
      if (result.estoqueParcial) {
        avisos.push(
          "parte da mercadoria já tinha saído, então o estoque baixou só o que ainda havia",
        );
      }
      if (!result.gastoRemovido) {
        avisos.push("confira o gasto desta nota no financeiro");
      }

      toast.success(
        avisos.length > 0
          ? `Nota cancelada — ${avisos.join("; ")}.`
          : "Nota cancelada. O estoque saiu e o gasto foi removido do financeiro.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="minimal:max-sm:h-11 minimal:max-sm:text-base h-14 px-6 text-lg font-medium"
      >
        <Undo2 aria-hidden="true" className="size-5" />
        Cancelar esta nota
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Cancelar esta nota?"
        description={
          <>
            A nota de <strong className="text-foreground">{fornecedor}</strong>{" "}
            foi lançada por engano? Ao cancelar:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>a mercadoria desta nota sai do estoque;</li>
              <li>
                o preço de custo dos produtos volta ao da compra anterior;
              </li>
              <li>o gasto desta nota sai do financeiro.</li>
            </ul>
            <span className="mt-2 block">
              A nota continua na lista, marcada como cancelada.{" "}
              <strong className="text-foreground">
                Isso não pode ser desfeito.
              </strong>
            </span>
          </>
        }
        confirmLabel="Cancelar a nota"
        confirmPendingLabel="Cancelando a nota…"
        cancelLabel="Voltar"
        confirmVariant="destructive"
        onConfirm={cancelar}
        pending={pending}
      />
    </>
  );
}
