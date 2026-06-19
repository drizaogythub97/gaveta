"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  digitsToBRL,
  digitsToDecimalString,
  numberToDigits,
  sanitizeDigits,
} from "@/lib/products/format";

type Props = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "name"
> & {
  name: string;
  initialValue?: number | null;
  onValueChange?: (value: number) => void;
};

/**
 * Campo monetário controlado: digita apenas números, exibe "R$ 10,50"
 * e submete o valor decimal ("10.50") via um <input type="hidden">
 * com o mesmo nome, para uso natural em FormData / Server Actions.
 */
export function CurrencyInput({
  name,
  initialValue,
  onValueChange,
  ...inputProps
}: Props) {
  const [digits, setDigits] = useState(() => numberToDigits(initialValue));

  const display = digits.length === 0 ? "" : digitsToBRL(digits);
  const decimalString = digits.length === 0 ? "" : digitsToDecimalString(digits);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = sanitizeDigits(event.target.value);
    setDigits(next);
    if (onValueChange) {
      onValueChange(Number(decimalString === "" ? "0" : next) / 100);
    }
  }

  return (
    <>
      <Input
        {...inputProps}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={inputProps.placeholder ?? "R$ 0,00"}
      />
      <input type="hidden" name={name} value={decimalString} />
    </>
  );
}
