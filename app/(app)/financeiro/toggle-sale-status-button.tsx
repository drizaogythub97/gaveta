"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { toggleSaleStatus } from "./actions";

type Props = {
  saleId: string;
  status: "completed" | "voided";
};

export function ToggleSaleStatusButton({ saleId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const voided = status === "voided";

  function handleClick() {
    startTransition(async () => {
      const result = await toggleSaleStatus(saleId, status);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível concluir. Tente novamente.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={
        voided
          ? "bg-success text-success-foreground h-12 w-full rounded-lg px-5 text-base font-medium hover:opacity-90 disabled:opacity-60"
          : "bg-destructive/10 text-destructive hover:bg-destructive/20 h-12 w-full rounded-lg px-5 text-base font-medium disabled:opacity-60"
      }
    >
      {isPending
        ? voided
          ? "Reativando…"
          : "Estornando…"
        : voided
          ? "Reativar"
          : "Estornar"}
    </button>
  );
}
