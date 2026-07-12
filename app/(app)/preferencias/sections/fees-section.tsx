"use client";

import { useActionState, useState } from "react";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentFees } from "@/lib/preferences/types";

import { type FeesFormState, saveFees } from "../actions";

const initialState: FeesFormState = {};

type Props = { initialFees: PaymentFees };

type FieldDef = {
  name: keyof PaymentFees;
  label: string;
  hint?: string;
};

const FIELDS: FieldDef[] = [
  { name: "pix_pct", label: "Pix" },
  { name: "debito_pct", label: "Cartão de débito" },
  { name: "credito_avista_pct", label: "Cartão de crédito à vista (1x)" },
  {
    name: "credito_parcelado_base_pct",
    label: "Cartão de crédito parcelado — base",
    hint: "Porcentagem que a maquininha cobra a partir de 2x (sem somar parcelas extras).",
  },
  {
    name: "credito_parcelado_por_parcela_pct",
    label: "Cartão de crédito parcelado — adicional por parcela",
    hint: "Cobrado para cada parcela acima da 1ª. Ex.: se a base é 3% e o adicional 0,5%, em 4x você paga 3% + (3 × 0,5%) = 4,5%.",
  },
  {
    name: "vale_pct",
    label: "Vale alimentação / refeição",
    hint: "Maquininhas geralmente cobram a mesma taxa para VA e VR.",
  },
];

function format(value: number): string {
  return value === 0 ? "" : value.toString().replace(".", ",");
}

export function FeesSection({ initialFees }: Props) {
  const [state, formAction] = useActionState(saveFees, initialState);
  const [values, setValues] = useState<Record<keyof PaymentFees, string>>(() => ({
    pix_pct: format(initialFees.pix_pct),
    debito_pct: format(initialFees.debito_pct),
    credito_avista_pct: format(initialFees.credito_avista_pct),
    credito_parcelado_base_pct: format(initialFees.credito_parcelado_base_pct),
    credito_parcelado_por_parcela_pct: format(
      initialFees.credito_parcelado_por_parcela_pct,
    ),
    vale_pct: format(initialFees.vale_pct),
  }));

  function setValue(key: keyof PaymentFees, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  return (
    <section
      aria-labelledby="fees-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1"
    >
      <header>
        <h2 id="fees-heading" className="minimal:max-sm:text-lg text-xl font-semibold">
          Taxas das maquininhas
        </h2>
        <p className="text-muted-foreground text-base">
          Consulte sua maquininha (Stone, Cielo, Rede, PagBank…) e cadastre as
          porcentagens cobradas em cada forma de pagamento. O sistema usa esses
          valores para mostrar bruto, taxa e líquido nos relatórios financeiros.
        </p>
      </header>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <ErrorAlert message={state.error} /> : null}
        {state.ok ? <SuccessAlert message="Taxas atualizadas." /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <Label htmlFor={f.name} className="text-base">
                {f.label}
              </Label>
              <div className="relative">
                <Input
                  id={f.name}
                  name={f.name}
                  type="text"
                  inputMode="decimal"
                  value={values[f.name]}
                  onChange={(e) => setValue(f.name, e.target.value)}
                  placeholder="0"
                  className="h-14 pr-10 text-lg"
                />
                <span
                  aria-hidden="true"
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base"
                >
                  %
                </span>
              </div>
              {f.hint ? (
                <p className="text-muted-foreground text-sm">{f.hint}</p>
              ) : null}
            </div>
          ))}
        </div>
        <SubmitButton className="sm:max-w-xs" pendingText="Salvando…">
          Salvar taxas
        </SubmitButton>
      </form>
    </section>
  );
}
