"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { salvarSwitcher } from "./actions";

/**
 * Primeiro toggle real do ecossistema (opt-in, nasce desligado): mostra ou
 * esconde o atalho para o outro app no topo (desktop) e no menu "Mais"
 * (celular). Vale para a conta — reflete nos dois apps.
 */
export function SwitcherToggle({ ativoInicial }: { ativoInicial: boolean }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [pending, startTransition] = useTransition();

  function escolher(novo: boolean) {
    if (novo === ativo || pending) return;
    startTransition(async () => {
      const { error } = await salvarSwitcher(novo);
      if (error) {
        toast.error(error);
        return;
      }
      setAtivo(novo);
      toast.success(novo ? "Atalho ativado." : "Atalho desativado.");
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Atalho rápido no menu"
      className="minimal:max-sm:grid minimal:max-sm:grid-cols-2 flex flex-wrap gap-2"
    >
      <Button
        type="button"
        role="radio"
        aria-checked={ativo}
        disabled={pending}
        variant={ativo ? "default" : "outline"}
        onClick={() => escolher(true)}
        className="minimal:max-sm:h-11 minimal:max-sm:px-2 minimal:max-sm:text-sm h-12 px-5 text-base"
      >
        <Check aria-hidden="true" className="size-5" />
        Ativado
      </Button>
      <Button
        type="button"
        role="radio"
        aria-checked={!ativo}
        disabled={pending}
        variant={!ativo ? "default" : "outline"}
        onClick={() => escolher(false)}
        className="minimal:max-sm:h-11 minimal:max-sm:px-2 minimal:max-sm:text-sm h-12 px-5 text-base"
      >
        <X aria-hidden="true" className="size-5" />
        Desativado
      </Button>
    </div>
  );
}
