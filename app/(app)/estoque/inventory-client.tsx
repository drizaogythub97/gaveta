"use client";

import {
  Box,
  Check,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOW_STOCK_THRESHOLD } from "@/lib/dashboard/dates";
import { formatBRL, formatQuantity, parseDecimalPtBR } from "@/lib/products/format";
import type { Product } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import { updateStock } from "./actions";

type Props = { products: Product[] };

export function InventoryClient({ products }: Props) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const filtered = useMemo(() => {
    const term = name.trim().toLowerCase();
    const fromDate = parseDate(from);
    const toDate = parseDate(to, true);
    const minN = minQty === "" ? null : Number(minQty.replace(",", "."));
    const maxN = maxQty === "" ? null : Number(maxQty.replace(",", "."));

    return products.filter((p) => {
      if (term && !p.name.toLowerCase().includes(term)) return false;
      const created = new Date(p.created_at).getTime();
      if (fromDate && created < fromDate.getTime()) return false;
      if (toDate && created > toDate.getTime()) return false;
      const qty = p.stock_quantity ?? 0;
      if (minN !== null && Number.isFinite(minN) && qty < minN) return false;
      if (maxN !== null && Number.isFinite(maxN) && qty > maxN) return false;
      if (onlyLow && qty > LOW_STOCK_THRESHOLD) return false;
      return true;
    });
  }, [products, name, from, to, minQty, maxQty, onlyLow]);

  function clearFilters() {
    setName("");
    setFrom("");
    setTo("");
    setMinQty("");
    setMaxQty("");
    setOnlyLow(false);
  }

  const hasFilters =
    name !== "" ||
    from !== "" ||
    to !== "" ||
    minQty !== "" ||
    maxQty !== "" ||
    onlyLow;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
        <legend className="text-lg font-semibold">Filtros</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-name" className="text-base">
              Nome
            </Label>
            <Input
              id="filter-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: refrigerante"
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-from" className="text-base">
              Cadastrado a partir de
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-to" className="text-base">
              Cadastrado até
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-min" className="text-base">
              Quantidade mínima
            </Label>
            <Input
              id="filter-min"
              type="text"
              inputMode="decimal"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              placeholder="Ex.: 1"
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-max" className="text-base">
              Quantidade máxima
            </Label>
            <Input
              id="filter-max"
              type="text"
              inputMode="decimal"
              value={maxQty}
              onChange={(e) => setMaxQty(e.target.value)}
              placeholder={`Ex.: ${LOW_STOCK_THRESHOLD}`}
              className="h-12 text-base"
            />
          </div>
          <div className="flex items-end">
            <label className="border-border bg-background hover:bg-muted flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 text-base font-medium transition-colors">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="size-5 accent-current"
              />
              Só estoque baixo (≤ {LOW_STOCK_THRESHOLD})
            </label>
          </div>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-primary self-start text-base font-medium underline underline-offset-4 hover:no-underline"
          >
            Limpar filtros
          </button>
        ) : null}
      </fieldset>

      <p className="text-muted-foreground text-base" aria-live="polite">
        {filtered.length} de {products.length}{" "}
        {products.length === 1 ? "produto" : "produtos"}.
      </p>

      {filtered.length === 0 ? (
        <div className="bg-muted/40 rounded-xl p-8 text-center">
          <p className="text-base">Nenhum produto bateu com os filtros.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((p) => (
            <StockRow key={p.id} product={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

type Mode = null | "set" | "add";

function StockRow({ product }: { product: Product }) {
  const [mode, setMode] = useState<Mode>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const qty = product.stock_quantity ?? 0;
  const low = qty <= LOW_STOCK_THRESHOLD;

  function openMode(next: "set" | "add") {
    setMode(next);
    setValue(next === "set" ? formatQuantity(qty).replace(/\./g, "") : "");
    setError(null);
    setFeedback(null);
  }

  function cancel() {
    setMode(null);
    setValue("");
    setError(null);
  }

  function submit() {
    const parsed = parseDecimalPtBR(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Quantidade inválida.");
      return;
    }
    if (mode === "add" && parsed === 0) {
      setError("Informe quanto chegou.");
      return;
    }

    const fd = new FormData();
    fd.set("id", product.id);
    fd.set("mode", mode!);
    fd.set("quantity", String(parsed));

    startTransition(async () => {
      const result = await updateStock(fd);
      if (result.ok) {
        setMode(null);
        setValue("");
        setError(null);
        setFeedback(
          mode === "add"
            ? `Entrada de ${formatQuantity(parsed)} registrada.`
            : `Estoque atualizado para ${formatQuantity(parsed)}.`,
        );
      } else {
        setError(result.error ?? "Erro ao salvar.");
      }
    });
  }

  return (
    <li
      className={cn(
        "ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-3.5 rounded-xl p-4 ring-1",
        low ? "ring-warning/30 bg-warning/5" : undefined,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-foreground text-lg font-semibold">
              {product.name}
            </span>
            <StockChip qty={qty} low={low} />
          </div>
          <div className="text-muted-foreground text-base">
            {formatBRL(product.price)}
          </div>
        </div>
        {mode === null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => openMode("set")}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-4 text-base"
            >
              <Pencil aria-hidden="true" className="size-4" />
              Atualizar quantidade
            </Button>
            <Button
              type="button"
              onClick={() => openMode("add")}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-4 text-base"
            >
              <PackagePlus aria-hidden="true" className="size-4" />
              Receber entrada
            </Button>
          </div>
        ) : null}
      </div>

      {mode !== null ? (
        <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-medium">
              {mode === "set" ? "Definir total para:" : "Receber entrada de:"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setValue((v) => {
                    const n = parseDecimalPtBR(v);
                    return Number.isFinite(n) && n > 0
                      ? String(Math.max(0, n - 1))
                      : "0";
                  })
                }
                aria-label="Diminuir 1"
                className="h-12 w-12 p-0"
              >
                <Minus aria-hidden="true" className="size-5" />
              </Button>
              <Input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                aria-label="Quantidade"
                className="h-12 w-24 text-center text-lg"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setValue((v) => {
                    const n = parseDecimalPtBR(v);
                    return String((Number.isFinite(n) ? n : 0) + 1);
                  })
                }
                aria-label="Aumentar 1"
                className="h-12 w-12 p-0"
              >
                <Plus aria-hidden="true" className="size-5" />
              </Button>
            </div>
            {mode === "add" ? (
              <span className="text-muted-foreground text-sm">
                Total ficará{" "}
                <strong className="text-foreground font-medium">
                  {formatQuantity(
                    qty + (Number.isFinite(parseDecimalPtBR(value))
                      ? parseDecimalPtBR(value)
                      : 0),
                  )}
                </strong>
                .
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={cancel}
              disabled={pending}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
            >
              <X aria-hidden="true" className="size-4" />
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              aria-busy={pending}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
            >
              <Check aria-hidden="true" className="size-4" />
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className="text-success text-sm" role="status" aria-live="polite">
          {feedback}
        </p>
      ) : null}
    </li>
  );
}

function StockChip({ qty, low }: { qty: number; low: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
        low ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary",
      )}
      aria-label={`Estoque ${formatQuantity(qty)}${low ? ", baixo" : ""}`}
    >
      <Box aria-hidden="true" className="size-4" />
      {low ? "Baixo: " : ""}
      {formatQuantity(qty)}
    </span>
  );
}

function parseDate(value: string, endOfDay = false): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}
