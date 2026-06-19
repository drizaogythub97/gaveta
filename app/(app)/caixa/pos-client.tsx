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
import {
  digitsToBRL,
  digitsToNumber,
  formatBRL,
  parseDecimalPtBR,
  sanitizeDigits,
} from "@/lib/products/format";
import { computeFeeAmount, type PaymentFees } from "@/lib/preferences/types";
import type { Product, SaleItemInput } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import {
  findProductByCode,
  type PaymentMethod,
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

const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito_avista", label: "Cartão de crédito à vista" },
  { value: "credito_parcelado", label: "Cartão de crédito parcelado" },
  { value: "vale", label: "Vale alimentação / refeição" },
];

const INSTALLMENT_OPTIONS = Array.from({ length: 11 }, (_, i) => i + 2); // 2x..12x

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

export function PosClient({ fees }: { fees: PaymentFees }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualName, setManualName] = useState<string | null>(null);
  const [manualPriceDigits, setManualPriceDigits] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [installments, setInstallments] = useState<number>(2);
  const [paidDigits, setPaidDigits] = useState("");
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
    setManualPriceDigits("");
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
    setManualPriceDigits("");
    setManualQty("1");
    setFeedback(null);
  }

  function handleManualSubmit() {
    if (!manualName) return;
    const price = digitsToNumber(manualPriceDigits);
    const qty = parseDecimalPtBR(manualQty);
    if (!Number.isFinite(price) || price <= 0) {
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

  const isCash = paymentMethod === "dinheiro";
  const isInstallment = paymentMethod === "credito_parcelado";
  const paidAmount = isCash ? digitsToNumber(paidDigits) : 0;
  const changeAmount = Math.round((paidAmount - total) * 100) / 100;
  const showChange = isCash && paidDigits.length > 0 && cart.length > 0;
  const enoughCash = !isCash || paidAmount >= total || cart.length === 0;

  const effectiveInstallments = isInstallment ? installments : null;
  const feeAmount = computeFeeAmount(
    total,
    paymentMethod,
    effectiveInstallments,
    fees,
  );
  const netAmount = Math.round((total - feeAmount) * 100) / 100;
  const installmentValue =
    isInstallment && installments > 0
      ? Math.round((total / installments) * 100) / 100
      : 0;

  function handleRegister() {
    if (cart.length === 0) {
      setFeedback({
        kind: "error",
        message: "Adicione ao menos um item à venda.",
      });
      return;
    }
    if (isCash && paidAmount < total) {
      setFeedback({
        kind: "error",
        message: "Valor recebido é menor que o total.",
      });
      return;
    }
    const items: SaleItemInput[] = cart.map((it) => ({
      product_id: it.product_id,
      name: it.name,
      unit_price: it.unit_price,
      quantity: Math.round(it.quantity * 1000) / 1000,
    }));
    const changeMessage =
      isCash && changeAmount > 0
        ? ` Troco: ${formatBRL(changeAmount)}.`
        : "";
    startRegister(async () => {
      const result = await registerSale(
        items,
        paymentMethod,
        effectiveInstallments,
        feeAmount,
      );
      if (result.ok) {
        setCart([]);
        setQuery("");
        clearManual();
        setSuggestions([]);
        setPaymentMethod("dinheiro");
        setInstallments(2);
        setPaidDigits("");
        const feeMessage =
          feeAmount > 0
            ? ` Taxa: ${formatBRL(feeAmount)}. Líquido: ${formatBRL(netAmount)}.`
            : "";
        setFeedback({
          kind: "success",
          message: `Venda registrada! Total ${formatBRL(total)}.${changeMessage}${feeMessage}`,
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
                  <span className="text-foreground font-medium">{p.name}</span>
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
                  Valor
                </Label>
                <Input
                  id={manualPriceId}
                  type="text"
                  inputMode="numeric"
                  value={
                    manualPriceDigits === ""
                      ? ""
                      : digitsToBRL(manualPriceDigits)
                  }
                  onChange={(e) =>
                    setManualPriceDigits(sanitizeDigits(e.target.value))
                  }
                  placeholder="R$ 0,00"
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
        aria-labelledby="payment-heading"
        className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2 id="payment-heading" className="text-xl font-semibold">
          Forma de pagamento
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-method" className="text-base">
              Como o cliente vai pagar?
            </Label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(e) => {
                const next = e.target.value as PaymentMethod;
                setPaymentMethod(next);
                if (next !== "dinheiro") setPaidDigits("");
              }}
              className="border-input bg-background h-14 w-full rounded-lg border px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {isInstallment ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="installments" className="text-base">
                Número de parcelas
              </Label>
              <select
                id="installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="border-input bg-background h-14 w-full rounded-lg border px-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {INSTALLMENT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
              {cart.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {installments}× de{" "}
                  <strong className="text-foreground font-medium">
                    {formatBRL(installmentValue)}
                  </strong>
                  .
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="paid-amount" className="text-base">
                Valor recebido
                {!isCash ? (
                  <span className="text-muted-foreground ml-1 text-sm font-normal">
                    (apenas dinheiro)
                  </span>
                ) : null}
              </Label>
              <Input
                id="paid-amount"
                type="text"
                inputMode="numeric"
                value={paidDigits === "" ? "" : digitsToBRL(paidDigits)}
                onChange={(e) => setPaidDigits(sanitizeDigits(e.target.value))}
                disabled={!isCash}
                placeholder="R$ 0,00"
                className="h-14 text-lg"
                aria-describedby="paid-amount-hint"
              />
              <p id="paid-amount-hint" className="text-muted-foreground text-sm">
                {isCash
                  ? "Digite quanto o cliente entregou para calcular o troco."
                  : "Não há troco para esta forma de pagamento."}
              </p>
            </div>
          )}
        </div>
        {feeAmount > 0 && cart.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Taxa estimada:{" "}
            <strong className="text-foreground font-medium">
              {formatBRL(feeAmount)}
            </strong>{" "}
            · Líquido:{" "}
            <strong className="text-foreground font-medium">
              {formatBRL(netAmount)}
            </strong>
            .
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="total-heading"
        className="bg-primary text-primary-foreground flex flex-col gap-4 rounded-xl p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            disabled={isRegistering || cart.length === 0 || !enoughCash}
            aria-busy={isRegistering}
            className="bg-background text-primary hover:bg-background/90 h-16 px-8 text-xl font-semibold"
          >
            {isRegistering ? "Registrando…" : "Registrar venda"}
          </Button>
        </div>
        {showChange ? (
          <div
            className="bg-primary-foreground/10 flex items-center justify-between rounded-lg px-4 py-3 text-lg"
            aria-live="polite"
          >
            <span className="opacity-90">
              {changeAmount >= 0 ? "Troco" : "Falta"}
            </span>
            <span
              className={cn(
                "text-2xl font-bold tabular-nums",
                changeAmount < 0 ? "text-warning-foreground" : "",
              )}
            >
              {formatBRL(Math.abs(changeAmount))}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
