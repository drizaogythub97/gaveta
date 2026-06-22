"use client";

import { useState, useTransition } from "react";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { removeBrandName, saveBrandName, type BrandFormState } from "../actions";

type Props = { initialName: string };

export function BrandSection({ initialName }: Props) {
  const [name, setName] = useState(initialName);
  const [feedback, setFeedback] = useState<BrandFormState>({});
  const [pending, startTransition] = useTransition();

  async function handleSave(formData: FormData) {
    const result = await saveBrandName({}, formData);
    setFeedback(result);
    if (result.ok) {
      setName(String(formData.get("brand_name") ?? "").trim());
    }
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeBrandName();
      setFeedback(result.ok ? { ok: true } : result);
      if (result.ok) setName("");
    });
  }

  const hasCustomName = name.trim().length > 0;

  return (
    <section
      aria-labelledby="brand-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
    >
      <header>
        <h2 id="brand-heading" className="text-xl font-semibold">
          Identidade do estabelecimento
        </h2>
        <p className="text-muted-foreground text-base">
          O nome aparece no cabeçalho. Sem um nome personalizado, usamos a marca
          padrão &ldquo;Gaveta&rdquo;.
        </p>
      </header>
      <form action={handleSave} className="flex flex-col gap-3">
        {feedback.error ? <ErrorAlert message={feedback.error} /> : null}
        {feedback.ok ? <SuccessAlert message="Nome salvo." /> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="brand_name" className="text-base">
            Nome
          </Label>
          <Input
            id="brand_name"
            name="brand_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Padaria do Zé"
            className="h-14 text-lg sm:max-w-md"
          />
          <p className="text-muted-foreground text-sm">Até 60 caracteres.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton className="sm:max-w-xs" pendingText="Salvando…">
            Salvar nome
          </SubmitButton>
          {hasCustomName ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={pending}
              className="h-14 text-base sm:max-w-xs"
            >
              Usar nome padrão (Gaveta)
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
