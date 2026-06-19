"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ErrorAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { type ProductFormState } from "./actions";

type Props = {
  action: (
    state: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
  initialValues?: {
    name?: string;
    barcode?: string;
    price?: string;
    trackStock?: "true" | "false";
    stockQuantity?: string;
  };
  submitLabel: string;
  submitPendingLabel: string;
};

const initialState: ProductFormState = {};

export function ProductForm({
  action,
  initialValues,
  submitLabel,
  submitPendingLabel,
}: Props) {
  const [state, formAction] = useActionState(action, initialState);
  const values = { ...initialValues, ...state.values };

  const initialTrack: "true" | "false" = values.trackStock ?? "true";
  const [trackStock, setTrackStock] = useState<"true" | "false">(initialTrack);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <ErrorAlert message={state.error} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name" className="text-base">
          Nome do produto
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          required
          defaultValue={values.name ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          className="h-14 text-lg"
        />
        {state.fieldErrors?.name ? (
          <p id="name-error" className="text-destructive text-sm" role="alert">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="barcode" className="text-base">
          Código de barras{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="barcode"
          name="barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.barcode ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.barcode)}
          aria-describedby={
            state.fieldErrors?.barcode ? "barcode-error" : "barcode-hint"
          }
          className="h-14 text-lg"
          placeholder="Bipe ou digite o código"
        />
        {state.fieldErrors?.barcode ? (
          <p
            id="barcode-error"
            className="text-destructive text-sm"
            role="alert"
          >
            {state.fieldErrors.barcode}
          </p>
        ) : (
          <p id="barcode-hint" className="text-muted-foreground text-sm">
            Deixe em branco se o produto não tiver código.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="price" className="text-base">
          Preço (R$)
        </Label>
        <Input
          id="price"
          name="price"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={values.price ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.price)}
          aria-describedby={state.fieldErrors?.price ? "price-error" : undefined}
          className="h-14 text-lg"
          placeholder="Ex.: 10,50"
        />
        {state.fieldErrors?.price ? (
          <p id="price-error" className="text-destructive text-sm" role="alert">
            {state.fieldErrors.price}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-medium">Controlar estoque?</legend>
        <div className="flex gap-3" role="radiogroup">
          {(
            [
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ] as const
          ).map((opt) => {
            const checked = trackStock === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex h-14 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-4 text-lg font-medium transition-colors",
                  checked
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="trackStock"
                  value={opt.value}
                  checked={checked}
                  onChange={() => setTrackStock(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">
          Itens sob demanda (ex.: marmita) podem deixar como{" "}
          <strong className="text-foreground font-medium">Não</strong>.
        </p>
        {state.fieldErrors?.trackStock ? (
          <p className="text-destructive text-sm" role="alert">
            {state.fieldErrors.trackStock}
          </p>
        ) : null}
      </fieldset>

      {trackStock === "true" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="stockQuantity" className="text-base">
            Quantidade em estoque
          </Label>
          <Input
            id="stockQuantity"
            name="stockQuantity"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={values.stockQuantity ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.stockQuantity)}
            aria-describedby={
              state.fieldErrors?.stockQuantity ? "stock-error" : undefined
            }
            className="h-14 text-lg"
            placeholder="Ex.: 12"
          />
          {state.fieldErrors?.stockQuantity ? (
            <p
              id="stock-error"
              className="text-destructive text-sm"
              role="alert"
            >
              {state.fieldErrors.stockQuantity}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row">
        <Link
          href="/produtos"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-14 flex-1 px-6 text-lg",
          )}
        >
          Cancelar
        </Link>
        <SubmitButton className="flex-1" pendingText={submitPendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
