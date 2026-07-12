"use client";

import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  digitsToBRL,
  digitsToDecimalString,
  digitsToNumber,
  formatBRL,
  sanitizeDigits,
} from "@/lib/products/format";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
} from "@/lib/types/expenses";
import { cn } from "@/lib/utils";

import { addExpense, deleteExpense } from "./expenses-actions";

type Feedback = { kind: "success" | "error"; message: string } | null;

/** Formata "YYYY-MM-DD" como "DD/MM/YYYY" sem conversão de fuso. */
function formatDateOnly(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function ExpensesClient({
  expenses,
  defaultDate,
  total,
}: {
  expenses: Expense[];
  defaultDate: string;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ExpenseForm defaultDate={defaultDate} />

      <section className="bg-primary text-primary-foreground flex items-center justify-between rounded-xl p-5">
        <span className="text-base opacity-90">Total de despesas no período</span>
        <span className="minimal:max-sm:text-xl text-3xl font-bold tabular-nums sm:text-4xl">
          {formatBRL(total)}
        </span>
      </section>

      {expenses.length === 0 ? (
        <div className="bg-muted/40 rounded-xl p-8 text-center">
          <p className="text-base">
            Nenhuma despesa neste período. Use o formulário acima para registrar.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpenseForm({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [category, setCategory] = useState<ExpenseCategory>("insumos");
  const [amountDigits, setAmountDigits] = useState("");
  const [description, setDescription] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  function submit() {
    setFeedback(null);
    if (digitsToNumber(amountDigits) <= 0) {
      setFeedback({ kind: "error", message: "Informe um valor maior que zero." });
      return;
    }
    const fd = new FormData();
    fd.set("incurred_on", date);
    fd.set("category", category);
    fd.set("amount", digitsToDecimalString(amountDigits));
    if (description.trim()) fd.set("description", description.trim());
    start(async () => {
      const res = await addExpense(fd);
      if (res.ok) {
        setAmountDigits("");
        setDescription("");
        setFeedback({ kind: "success", message: "Despesa registrada." });
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <section className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
      <h2 className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold">
        <Plus aria-hidden="true" className="size-6" />
        Registrar despesa
      </h2>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-date" className="text-base">
            Data
          </Label>
          <Input
            id="expense-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-category" className="text-base">
            Categoria
          </Label>
          <select
            id="expense-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-amount" className="text-base">
            Valor
          </Label>
          <Input
            id="expense-amount"
            type="text"
            inputMode="numeric"
            value={amountDigits === "" ? "" : digitsToBRL(amountDigits)}
            onChange={(e) => setAmountDigits(sanitizeDigits(e.target.value))}
            placeholder="R$ 0,00"
            className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-desc" className="text-base">
            Descrição (opcional)
          </Label>
          <Input
            id="expense-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: conta de luz"
            className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 text-base"
            maxLength={280}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-busy={pending}
          className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-12 px-6 text-base font-semibold"
        >
          {pending ? "Salvando…" : "Salvar despesa"}
        </Button>
      </div>
    </section>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    const fd = new FormData();
    fd.set("id", expense.id);
    start(async () => {
      const res = await deleteExpense(fd);
      if (!res.ok) setFeedback(res.error);
    });
  }

  return (
    <li className="ring-foreground/10 bg-card flex items-center justify-between gap-3 minimal:max-sm:p-3.5 rounded-xl p-4 ring-1">
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-lg font-medium">
          {EXPENSE_CATEGORY_LABELS[expense.category]}
        </span>
        <span className="text-muted-foreground text-sm">
          {formatDateOnly(expense.incurred_on)}
          {expense.description ? ` · ${expense.description}` : ""}
        </span>
        {feedback ? (
          <span className="text-destructive text-sm" role="alert">
            {feedback}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-foreground text-lg font-semibold tabular-nums">
          {formatBRL(Number(expense.amount))}
        </span>
        <Button
          type="button"
          variant="destructive"
          onClick={remove}
          disabled={pending}
          aria-busy={pending}
          aria-label={`Excluir despesa ${EXPENSE_CATEGORY_LABELS[expense.category]}`}
          className="h-11 w-11 p-0"
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </li>
  );
}
