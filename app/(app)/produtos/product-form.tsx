"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ErrorAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { CurrencyInput } from "@/components/app/currency-input";
import { Button, buttonVariants } from "@/components/ui/button";
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
    barcodes?: string[];
    price?: number;
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

  const [name, setName] = useState(initialValues?.name ?? "");
  const initialBarcodes = initialValues?.barcodes ?? [];
  const [barcodes, setBarcodes] = useState<string[]>(
    initialBarcodes.length > 0 ? initialBarcodes : [""],
  );
  const [trackStock, setTrackStock] = useState<"true" | "false">(
    initialValues?.trackStock ?? "true",
  );
  const [stockQuantity, setStockQuantity] = useState(
    initialValues?.stockQuantity ?? "",
  );

  function setBarcodeAt(index: number, value: string) {
    setBarcodes((prev) => prev.map((b, i) => (i === index ? value : b)));
  }
  function addBarcode() {
    setBarcodes((prev) => [...prev, ""]);
  }
  function removeBarcode(index: number) {
    setBarcodes((prev) =>
      prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index),
    );
  }

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
          value={name}
          onChange={(e) => setName(e.target.value)}
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-medium">
          Códigos de barras{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </legend>
        <p
          id="barcodes-hint"
          className="text-muted-foreground text-sm"
        >
          Você pode cadastrar mais de um código para o mesmo produto — útil
          quando a embalagem muda ou o item é vendido em formatos diferentes.
        </p>
        <ul className="flex flex-col gap-2">
          {barcodes.map((code, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                name="barcodes"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={code}
                onChange={(e) => setBarcodeAt(index, e.target.value)}
                aria-label={`Código de barras ${index + 1}`}
                aria-describedby="barcodes-hint"
                className="h-14 flex-1 text-lg"
                placeholder="Bipe ou digite o código"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => removeBarcode(index)}
                aria-label={`Remover código ${index + 1}`}
                className="h-14 w-14 p-0"
              >
                <Trash2 aria-hidden="true" className="size-5" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={addBarcode}
          className="h-12 self-start px-4 text-base"
        >
          <Plus aria-hidden="true" className="size-4" />
          Adicionar outro código
        </Button>
        {state.fieldErrors?.barcodes ? (
          <p className="text-destructive text-sm" role="alert">
            {state.fieldErrors.barcodes}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="price" className="text-base">
          Preço
        </Label>
        <CurrencyInput
          id="price"
          name="price"
          required
          initialValue={initialValues?.price ?? null}
          aria-invalid={Boolean(state.fieldErrors?.price)}
          aria-describedby={state.fieldErrors?.price ? "price-error" : undefined}
          className="h-14 text-lg"
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
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
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
