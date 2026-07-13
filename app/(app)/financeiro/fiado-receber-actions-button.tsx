"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";

import { excluirVendaAPrazo } from "./fiado-receber-actions";

/**
 * Botão de excluir uma venda a prazo direto do financeiro do Gaveta, com
 * confirmação. Sinaliza quando a venda já tem pagamento (o histórico de
 * recebimento no FiadoApp seria apagado). Remove os dois lados (F6 Fase 3).
 */
export function FiadoAReceberDeleteButton({
  vendaId,
  cliente,
  temPagamento,
}: {
  vendaId: string;
  cliente: string;
  temPagamento: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function excluir() {
    startTransition(async () => {
      const result = await excluirVendaAPrazo(vendaId);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir.");
        return;
      }
      toast.success("Venda a prazo excluída.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Excluir venda a prazo de ${cliente}`}
        className="text-muted-foreground hover:text-destructive inline-flex size-8 items-center justify-center rounded-md"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Excluir venda a prazo"
        description={
          <>
            A venda a prazo de{" "}
            <strong className="text-foreground">{cliente}</strong> será excluída
            aqui e também no FiadoApp; o estoque dos itens é devolvido.
            {temPagamento ? (
              <>
                <br />
                <span className="text-destructive font-medium">
                  Atenção: esta venda já tem pagamento registrado no FiadoApp —
                  o histórico de recebimento será apagado.
                </span>
              </>
            ) : null}
          </>
        }
        confirmLabel="Excluir"
        confirmVariant="destructive"
        onConfirm={excluir}
        pending={pending}
      />
    </>
  );
}
