"use client";

import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  ScanBarcode,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseDecimalPtBR } from "@/lib/products/format";
import type { Product, SaleItemInput } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import {
  findProductByCode,
  registerSale,
  searchProductsByName,
} from "./actions";

type CartItem = {
  key: string;
  product_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
};

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

function makeKey() {
  return Math.random().toString(36).slice(2, 10);
}

function toItem(product: Product): CartItem {
  return {
    key: makeKey(),
    product_id: product.id,
    name: product.name,
    unit_price: product.price,
    quantity: 1,
  };
}

export function PosClient() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualName, setManualName] = useState<string | null>(null);
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isRegistering, startRegister] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const fetchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualPriceId = useId();
  const manualQtyId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function refocus() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function clearManual() {
    setManualName(null);
    setManualPrice("");
    setManualQty("1");
  }

  function addProductToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.key === existing.key
            ? { ...it, quantity: it.quantity + 1 }
            : it,
        );
      }
      return [...prev, toItem(product)];
    });
    setQuery("");
    setSuggestions([]);
    clearManual();
    setFeedback(null);
    refocus();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setFeedback(null);
    if (manualName) clearManual();

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const term = value.trim();
    if (term.length === 0) {
      setSuggestions([]);
      return;
    }
    const seq = ++fetchSeq.current;
    debounceTimer.current = setTimeout(async () => {
      const result = await searchProductsByName(term);
      if (seq === fetchSeq.current) setSuggestions(result);
    }, 220);
  }

  async function handleSubmitQuery() {
    const term = query.trim();
    if (term.length === 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    fetchSeq.current++;

    const product = await findProductByCode(term);
    if (product) {
      addProductToCart(product);
      return;
    }

    setSuggestions([]);
    setManualName(term);
    setManualPrice("");
    setManualQty("1");
    setFeedback(null);
  }

  function handleManualSubmit() {
    if (!manualName) return;
    const price = parseDecimalPtBR(manualPrice);
    const qty = parseDecimalPtBR(manualQty);
    if (!Number.isFinite(price) || price < 0) {
      setFeedback({ kind: "error", message: "Informe um valor válido." });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({ kind: "error", message: "Informe uma quantidade válida." });
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        key: makeKey(),
        product_id: null,
        name: manualName,
        unit_price: Math.round(price * 100) / 100,
        quantity: qty,
      },
    ]);
    setQuery("");
    clearManual();
    setFeedback(null);
    refocus();
  }

  function updateQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((it) =>
          it.key === key
            ? { ...it, quantity: Math.max(0, it.quantity + delta) }
            : it,
        )
        .filter((it) => it.quantity > 0),
    );
  }

  function setQuantity(key: string, raw: string) {
    const n = parseDecimalPtBR(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setCart((prev) =>
      prev.map((it) => (it.key === key ? { ...it, quantity: n } : it)),
    );
  }

  function removeItem(key: string) {
    setCart((prev) => prev.filter((it) => it.key !== key));
  }

  const total = cart.reduce(
    (sum, it) => sum + Math.round(it.unit_price * it.quantity * 100) / 100,
    0,
  );

  function handleRegister() {
    if (cart.length === 0) {
      setFeedback({
        kind: "error",
        message: "Adicione ao menos um item à venda.",
      });
      return;
    }
    const items: SaleItemInput[] = cart.map((it) => ({
      product_id: it.product_id,
      name: it.name,
      unit_price: it.unit_price,
      quantity: Math.round(it.quantity * 1000) / 1000,
    }));
    startRegister(async () => {
      const result = await registerSale(items);
      if (result.ok) {
        setCart([]);
        setQuery("");
        clearManual();
        setSuggestions([]);
        setFeedback({
          kind: "success",
          message: `Venda registrada! Total ${formatBRL(total)}.`,
        });
        refocus();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="add-item-heading"
        className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2
          id="add-item-heading"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <ScanBarcode aria-hidden="true" className="size-6" />
          Adicionar item
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pos-query" className="text-base">
            Bipe o código de barras ou digite o nome
          </Label>
          <Input
            ref={inputRef}
            id="pos-query"
            type="text"
            autoComplete="off"
            inputMode="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmitQuery();
              }
            }}
            className="h-16 text-xl"
            placeholder="Ex.: 7891234567890 ou Refrigerante"
            aria-describedby="pos-query-hint"
            disabled={isRegistering}
          />
          <p id="pos-query-hint" className="text-muted-foreground text-sm">
            O leitor USB envia o código e aperta Enter automaticamente.
          </p>
        </div>

        {suggestions.length > 0 && manualName === null ? (
          <ul
            role="listbox"
            aria-label="Sugestões de produtos"
            className="flex flex-col gap-1"
          >
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addProductToCart(p)}
                  className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left text-base outline-none"
                >
                  <span className="flex flex-col">
                    <span className="text-foreground font-medium">{p.name}</span>
                    {p.barcode ? (
                      <span className="text-muted-foreground font-mono text-sm">
                        {p.barcode}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-foreground text-lg font-semibold">
                    {formatBRL(p.price)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {manualName ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <p className="text-base">
              Nenhum produto encontrado para{" "}
              <strong className="font-medium">&ldquo;{manualName}&rdquo;</strong>.
              Adicionar como item avulso?
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={manualPriceId} className="text-sm">
                  Valor (R$)
                </Label>
                <Input
                  id={manualPriceId}
                  type="text"
                  inputMode="decimal"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="Ex.: 12,00"
                  className="h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={manualQtyId} className="text-sm">
                  Quantidade
                </Label>
                <Input
                  id={manualQtyId}
                  type="text"
                  inputMode="decimal"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  clearManual();
                  refocus();
                }}
                className="h-12 px-5 text-base"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleManualSubmit}
                className="h-12 px-5 text-base"
              >
                Adicionar avulso
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {feedback ? (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-3 text-base",
            feedback.kind === "success"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 aria-hidden="true" className="size-5" />
          ) : (
            <AlertCircle aria-hidden="true" className="size-5" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <section
        aria-labelledby="cart-heading"
        className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2 id="cart-heading" className="text-xl font-semibold">
          Itens da venda
        </h2>
        {cart.length === 0 ? (
          <p className="text-muted-foreground text-base">
            Bipe ou digite para começar.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((it) => (
              <li
                key={it.key}
                className="border-border flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-foreground text-lg font-medium">
                    {it.name}
                    {it.product_id === null ? (
                      <span className="text-muted-foreground ml-2 text-sm font-normal">
                        (avulso)
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-base">
                    {formatBRL(it.unit_price)} cada
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateQuantity(it.key, -1)}
                      aria-label="Diminuir quantidade"
                      className="h-12 w-12 p-0"
                    >
                      <Minus aria-hidden="true" className="size-5" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={it.quantity.toString().replace(".", ",")}
                      onChange={(e) => setQuantity(it.key, e.target.value)}
                      aria-label={`Quantidade de ${it.name}`}
                      className="h-12 w-20 text-center text-lg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateQuantity(it.key, 1)}
                      aria-label="Aumentar quantidade"
                      className="h-12 w-12 p-0"
                    >
                      <Plus aria-hidden="true" className="size-5" />
                    </Button>
                  </div>
                  <span className="text-foreground min-w-[6rem] text-right text-lg font-semibold">
                    {formatBRL(
                      Math.round(it.unit_price * it.quantity * 100) / 100,
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => removeItem(it.key)}
                    aria-label={`Remover ${it.name}`}
                    className="h-12 w-12 p-0"
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="total-heading"
        className="bg-primary text-primary-foreground flex flex-col gap-4 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p id="total-heading" className="text-base opacity-90">
            Total da venda
          </p>
          <p
            className="text-4xl font-bold tabular-nums sm:text-5xl"
            aria-live="polite"
          >
            {formatBRL(total)}
          </p>
        </div>
        <Button
          type="button"
          onClick={handleRegister}
          disabled={isRegistering || cart.length === 0}
          aria-busy={isRegistering}
          className="bg-background text-primary hover:bg-background/90 h-16 px-8 text-xl font-semibold"
        >
          {isRegistering ? "Registrando…" : "Registrar venda"}
        </Button>
      </section>
    </div>
  );
}
