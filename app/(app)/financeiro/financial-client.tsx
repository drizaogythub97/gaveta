"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_LABELS, type Period } from "@/lib/dashboard/dates";
import { SALE_SORTS, SORT_LABELS, type SaleSort } from "@/lib/financeiro/sort";
import { PAYMENT_METHOD_LABELS } from "@/lib/types/sales";
import type { PaymentMethod } from "@/app/(app)/caixa/actions";
import { cn } from "@/lib/utils";

type Props = {
  period: Period;
  from: string;
  to: string;
  selectedMethods: PaymentMethod[];
  sort: SaleSort;
  showMethods?: boolean;
  showSort?: boolean;
};

const ORDERED_PERIODS: Period[] = ["today", "7d", "30d", "month", "custom"];

const ALL_METHODS: PaymentMethod[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_avista",
  "credito_parcelado",
  "vale",
];

function buildHref(
  base: URLSearchParams,
  overrides: Record<string, string | null>,
) {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "?";
}

export function FinancialClient({
  period,
  from,
  to,
  selectedMethods,
  sort,
  showMethods = true,
  showSort = true,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const baseParams = new URLSearchParams(params?.toString() ?? "");

  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  function toggleMethod(method: PaymentMethod) {
    const next = new Set(selectedMethods);
    if (next.has(method)) next.delete(method);
    else next.add(method);
    const list = Array.from(next);
    const href = buildHref(baseParams, {
      methods: list.length === 0 ? null : list.join(","),
      page: null, // filtros novos voltam à primeira página
    });
    router.push(href);
  }

  function clearMethods() {
    router.push(buildHref(baseParams, { methods: null, page: null }));
  }

  return (
    <div className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Período</legend>
        <div
          role="radiogroup"
          aria-label="Período de tempo"
          className="flex flex-wrap gap-2"
        >
          {ORDERED_PERIODS.map((p) => {
            const active = p === period;
            const href = buildHref(baseParams, {
              period: p,
              from: p === "custom" ? from : null,
              to: p === "custom" ? to : null,
              page: null,
            });
            return (
              <Link
                key={p}
                href={href}
                role="radio"
                aria-checked={active}
                className={cn(
                  "flex h-12 items-center justify-center rounded-lg px-4 text-base font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-muted border bg-transparent",
                )}
              >
                {PERIOD_LABELS[p]}
              </Link>
            );
          })}
        </div>
      </fieldset>

      {period === "custom" ? (
        <form
          method="get"
          className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="period" value="custom" />
          {selectedMethods.length > 0 ? (
            <input
              type="hidden"
              name="methods"
              value={selectedMethods.join(",")}
            />
          ) : null}
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="from" className="text-base">
              De
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              className="h-12 text-base"
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="to" className="text-base">
              Até
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              className="h-12 text-base"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-lg px-5 text-base font-medium"
          >
            Aplicar
          </button>
        </form>
      ) : null}

      {showSort ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sort" className="text-lg font-semibold">
            Ordenar por
          </Label>
          <select
            id="sort"
            value={sort}
            onChange={(e) =>
              router.push(
                buildHref(baseParams, { sort: e.target.value, page: null }),
              )
            }
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-12 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3 sm:max-w-xs"
          >
            {SALE_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {showMethods ? (
      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Forma de pagamento</legend>
        <p className="text-muted-foreground text-sm">
          Marque uma ou mais para filtrar. Sem nada marcado, todas aparecem.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_METHODS.map((method) => {
            const active = selectedMethods.includes(method);
            return (
              <button
                key={method}
                type="button"
                aria-pressed={active}
                onClick={() => toggleMethod(method)}
                className={cn(
                  "h-11 rounded-full border px-4 text-base font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted bg-transparent",
                )}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </button>
            );
          })}
          {selectedMethods.length > 0 ? (
            <button
              type="button"
              onClick={clearMethods}
              className="text-primary text-base font-medium underline underline-offset-4 hover:no-underline"
            >
              Limpar
            </button>
          ) : null}
        </div>
      </fieldset>
      ) : null}
    </div>
  );
}
