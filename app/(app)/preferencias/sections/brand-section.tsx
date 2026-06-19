"use client";

import { useActionState, useState } from "react";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type BrandFormState, saveBrandName } from "../actions";

const initialState: BrandFormState = {};

type Props = { initialName: string };

export function BrandSection({ initialName }: Props) {
  const [state, formAction] = useActionState(saveBrandName, initialState);
  const [name, setName] = useState(initialName);

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
          O nome aparece no cabeçalho. Deixe em branco para usar o padrão
          &ldquo;ERP Simples&rdquo;.
        </p>
      </header>
      <form action={formAction} className="flex flex-col gap-3">
        {state.error ? <ErrorAlert message={state.error} /> : null}
        {state.ok ? <SuccessAlert message="Nome salvo." /> : null}
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
          <p className="text-muted-foreground text-sm">
            Até 60 caracteres.
          </p>
        </div>
        <SubmitButton className="sm:max-w-xs" pendingText="Salvando…">
          Salvar nome
        </SubmitButton>
      </form>
    </section>
  );
}
