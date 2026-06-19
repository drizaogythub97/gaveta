"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_LABELS, type Period } from "@/lib/dashboard/dates";
import { cn } from "@/lib/utils";

type Props = {
  period: Period;
  from: string;
  to: string;
};

const ORDERED_PERIODS: Period[] = ["today", "7d", "30d", "month", "custom"];

export function FinancialClient({ period, from, to }: Props) {
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  return (
    <div className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">Período</legend>
        <div
          role="radiogroup"
          aria-label="Período de tempo"
          className="flex flex-wrap gap-2"
        >
          {ORDERED_PERIODS.map((p) => {
            const active = p === period;
            return (
              <Link
                key={p}
                href={p === "custom" ? `?period=custom` : `?period=${p}`}
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
    </div>
  );
}
