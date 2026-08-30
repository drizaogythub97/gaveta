"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_LABELS, type Period } from "@/lib/dashboard/dates";
import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";
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

export function FinancialClient({
  period,
  from,
  to,
  selectedMethods,
  sort,
  showMethods = true,
  showSort = true,
}: Props) {
  const { pendente, href, aplicar } = useFiltroNav();

  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  function toggleMethod(method: PaymentMethod) {
    const next = new Set(selectedMethods);
    if (next.has(method)) next.delete(method);
    else next.add(method);
    const list = Array.from(next);
    aplicar({
      methods: list.length === 0 ? null : list.join(","),
      page: null, // filtros novos voltam à primeira página
    });
  }

  function clearMethods() {
    aplicar({ methods: null, page: null });
  }

  // O intervalo personalizado era um <form method="get">: o navegador
  // montava uma query NOVA com os campos do formulário, jogando fora a aba
  // aberta e a ordenação, e recarregava o documento inteiro. Agora é o mesmo
  // caminho dos outros filtros.
  function aplicarIntervalo(event: React.FormEvent) {
    event.preventDefault();
    aplicar(mudancaDePeriodo("custom"));
  }

  // Ao entrar no "Personalizado" valem as datas que estão NOS CAMPOS — não
  // as do período anterior, senão a tela mostraria um intervalo e filtraria
  // por outro.
  function mudancaDePeriodo(p: Period) {
    return {
      period: p,
      from: p === "custom" ? fromValue : null,
      to: p === "custom" ? toValue : null,
      page: null,
    };
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
            const destino = href(mudancaDePeriodo(p));
            return (
              <Link
                key={p}
                href={destino}
                onClick={(e) => {
                  // Mesma transição dos demais filtros: sem o carregador de
                  // tela cheia entre um período e outro.
                  e.preventDefault();
                  aplicar(mudancaDePeriodo(p));
                }}
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
          onSubmit={aplicarIntervalo}
          className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-end"
        >
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
            disabled={pendente}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-lg px-5 text-base font-medium disabled:opacity-70"
          >
            {pendente ? "Aplicando…" : "Aplicar"}
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
            onChange={(e) => aplicar({ sort: e.target.value, page: null })}
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
