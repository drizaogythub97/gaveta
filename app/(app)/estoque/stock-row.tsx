"use client";

import { Box, Check, Minus, PackagePlus, Pencil, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOW_STOCK_THRESHOLD } from "@/lib/dashboard/dates";
import {
  formatBRL,
  formatQuantity,
  parseDecimalPtBR,
} from "@/lib/products/format";
import type { Product } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import { updateStock } from "./actions";

/**
 * Uma linha da lista do Estoque, com a edição de quantidade embutida.
 *
 * É a única parte da tela que precisa de cliente: a listagem e os filtros
 * passaram para o servidor, e cada linha guarda apenas o próprio formulário
 * aberto. Antes isto vivia dentro de um componente que também segurava o
 * catálogo inteiro em memória para filtrar no navegador.
 */
type Mode = null | "set" | "add";

export function StockRow({ product }: { product: Product }) {
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
        "ring-foreground/10 bg-card minimal:max-sm:p-3.5 flex flex-col gap-3 rounded-xl p-4 ring-1",
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
              className="minimal:max-sm:h-10 minimal:max-sm:text-sm h-12 flex-1 px-4 text-base sm:flex-initial"
            >
              <Pencil aria-hidden="true" className="size-4" />
              Atualizar quantidade
            </Button>
            <Button
              type="button"
              onClick={() => openMode("add")}
              className="minimal:max-sm:h-10 minimal:max-sm:text-sm h-12 flex-1 px-4 text-base sm:flex-initial"
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
                    qty +
                      (Number.isFinite(parseDecimalPtBR(value))
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
