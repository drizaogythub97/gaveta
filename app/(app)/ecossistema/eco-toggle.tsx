"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Toggle padrão das pontes do ecossistema (opt-in, nascem desligadas).
 * Recebe a server action que persiste a escolha; o refresh reflete o
 * efeito (ex.: atalho aparecer no layout, marca sincronizar).
 */
export function EcoToggle({
  ativoInicial,
  rotulo,
  onSalvar,
  msgAtivado,
  msgDesativado,
}: {
  ativoInicial: boolean;
  /** aria-label do grupo. */
  rotulo: string;
  onSalvar: (ativo: boolean) => Promise<{ error?: string }>;
  msgAtivado: string;
  msgDesativado: string;
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [pending, startTransition] = useTransition();

  function escolher(novo: boolean) {
    if (novo === ativo || pending) return;
    startTransition(async () => {
      const { error } = await onSalvar(novo);
      if (error) {
        toast.error(error);
        return;
      }
      setAtivo(novo);
      toast.success(novo ? msgAtivado : msgDesativado);
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
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
