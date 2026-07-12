"use client";

import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  LockKeyhole,
  Unlock,
} from "lucide-react";
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
  CASH_MOVEMENT_LABELS,
  type CashMovement,
  type CashMovementType,
  type CashSession,
} from "@/lib/types/cash";
import { cn } from "@/lib/utils";

import {
  addCashMovement,
  closeSession,
  openSession,
  type CloseSessionResult,
} from "./actions";

type Props = {
  session: CashSession | null;
  movements: CashMovement[];
  cashSalesTotal: number;
  cashSalesCount: number;
  suprimentos: number;
  sangrias: number;
  expected: number;
  closedSessions: CashSession[];
};

type Feedback = { kind: "success" | "error"; message: string } | null;

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
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
  );
}

export function SessionClient(props: Props) {
  const { session } = props;
  const [closeResult, setCloseResult] = useState<{
    expected: number;
    counted: number;
    difference: number;
  } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {closeResult ? <CloseSummary {...closeResult} /> : null}
      {session ? (
        <OpenSessionPanel {...props} session={session} onClosed={setCloseResult} />
      ) : (
        <OpenForm onOpened={() => setCloseResult(null)} />
      )}
      <ClosedHistory sessions={props.closedSessions} />
    </div>
  );
}

function CloseSummary({
  expected,
  counted,
  difference,
}: {
  expected: number;
  counted: number;
  difference: number;
}) {
  const exact = Math.abs(difference) < 0.005;
  const over = difference > 0;
  return (
    <section
      aria-live="polite"
      className="ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-4 rounded-xl p-5 ring-1"
    >
      <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Caixa fechado</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Esperado" value={formatBRL(expected)} />
        <Stat label="Contado" value={formatBRL(counted)} />
        <div
          className={cn(
            "rounded-lg p-3",
            exact
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning",
          )}
        >
          <p className="text-sm opacity-90">Diferença</p>
          <p className="text-2xl font-bold tabular-nums">
            {exact
              ? formatBRL(0)
              : `${over ? "sobra " : "falta "}${formatBRL(Math.abs(difference))}`}
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-foreground text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CurrencyField({
  id,
  label,
  digits,
  onChange,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  digits: string;
  onChange: (d: string) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={digits === "" ? "" : digitsToBRL(digits)}
        onChange={(e) => onChange(sanitizeDigits(e.target.value))}
        placeholder="R$ 0,00"
        className="h-14 text-lg"
        autoFocus={autoFocus}
      />
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}

function OpenForm({ onOpened }: { onOpened: () => void }) {
  const [openingDigits, setOpeningDigits] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.set("opening", digitsToDecimalString(openingDigits));
    if (note.trim()) fd.set("note", note.trim());
    start(async () => {
      const res = await openSession(fd);
      if (res.ok) {
        onOpened();
        setOpeningDigits("");
        setNote("");
        setFeedback({ kind: "success", message: "Caixa aberto." });
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <section className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
      <h2 className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold">
        <Unlock aria-hidden="true" className="size-6" />
        Abrir o caixa
      </h2>
      <p className="text-muted-foreground text-base">
        Informe o troco que está na gaveta no início. Enquanto o caixa estiver
        aberto, as vendas em dinheiro entram automaticamente nesta sessão.
      </p>
      <FeedbackBanner feedback={feedback} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CurrencyField
          id="opening-amount"
          label="Troco inicial"
          digits={openingDigits}
          onChange={setOpeningDigits}
          hint="Pode ser R$ 0,00 se não houver troco."
          autoFocus
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="opening-note" className="text-base">
            Observação (opcional)
          </Label>
          <Input
            id="opening-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: turno da manhã"
            className="h-14 text-lg"
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
          className="h-14 px-8 text-lg font-semibold"
        >
          {pending ? "Abrindo…" : "Abrir caixa"}
        </Button>
      </div>
    </section>
  );
}

function OpenSessionPanel({
  session,
  movements,
  cashSalesTotal,
  cashSalesCount,
  suprimentos,
  sangrias,
  expected,
  onClosed,
}: Props & {
  session: CashSession;
  onClosed: (r: { expected: number; counted: number; difference: number }) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Caixa aberto</h2>
          <span className="bg-success/15 text-success rounded-full px-3 py-1 text-sm font-medium">
            Aberto desde {formatDateTime(session.opened_at)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Troco inicial" value={formatBRL(session.opening_amount)} />
          <Stat
            label={`Vendas em dinheiro (${cashSalesCount})`}
            value={formatBRL(cashSalesTotal)}
          />
          <Stat label="Suprimentos" value={formatBRL(suprimentos)} />
          <Stat label="Sangrias" value={formatBRL(sangrias)} />
        </div>
        <div className="bg-primary text-primary-foreground flex items-center justify-between rounded-lg p-4">
          <span className="text-base opacity-90">Esperado em caixa agora</span>
          <span className="text-3xl font-bold tabular-nums" aria-live="polite">
            {formatBRL(expected)}
          </span>
        </div>
        {session.opening_note ? (
          <p className="text-muted-foreground text-sm">
            Observação de abertura: {session.opening_note}
          </p>
        ) : null}
      </section>

      <MovementForm />

      {movements.length > 0 ? (
        <section className="ring-foreground/10 bg-card flex flex-col gap-3 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
          <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Movimentos do caixa</h2>
          <ul className="flex flex-col gap-2">
            {movements.map((m) => (
              <li
                key={m.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  {m.type === "suprimento" ? (
                    <ArrowUpCircle
                      aria-hidden="true"
                      className="text-success size-5"
                    />
                  ) : (
                    <ArrowDownCircle
                      aria-hidden="true"
                      className="text-destructive size-5"
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="text-foreground text-base font-medium">
                      {CASH_MOVEMENT_LABELS[m.type]}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {formatDateTime(m.created_at)}
                      {m.note ? ` · ${m.note}` : ""}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    m.type === "suprimento" ? "text-success" : "text-destructive",
                  )}
                >
                  {m.type === "suprimento" ? "+" : "−"}
                  {formatBRL(Number(m.amount))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CloseForm expected={expected} onClosed={onClosed} />
    </div>
  );
}

function MovementForm() {
  const [type, setType] = useState<CashMovementType>("sangria");
  const [amountDigits, setAmountDigits] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  function submit() {
    setFeedback(null);
    if (digitsToNumber(amountDigits) <= 0) {
      setFeedback({ kind: "error", message: "Informe um valor maior que zero." });
      return;
    }
    const fd = new FormData();
    fd.set("type", type);
    fd.set("amount", digitsToDecimalString(amountDigits));
    if (note.trim()) fd.set("note", note.trim());
    start(async () => {
      const res = await addCashMovement(fd);
      if (res.ok) {
        setAmountDigits("");
        setNote("");
        setFeedback({
          kind: "success",
          message:
            type === "sangria"
              ? "Sangria registrada."
              : "Suprimento registrado.",
        });
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <section className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
      <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Registrar movimento</h2>
      <p className="text-muted-foreground text-base">
        <strong className="text-foreground font-medium">Sangria</strong> é uma
        retirada de dinheiro da gaveta;{" "}
        <strong className="text-foreground font-medium">suprimento</strong> é um
        reforço (dinheiro colocado).
      </p>
      <FeedbackBanner feedback={feedback} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="movement-type" className="text-base">
            Tipo
          </Label>
          <select
            id="movement-type"
            value={type}
            onChange={(e) => setType(e.target.value as CashMovementType)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-14 w-full rounded-lg border px-3 text-lg outline-none focus-visible:ring-3"
          >
            <option value="sangria">Sangria (retirada)</option>
            <option value="suprimento">Suprimento (reforço)</option>
          </select>
        </div>
        <CurrencyField
          id="movement-amount"
          label="Valor"
          digits={amountDigits}
          onChange={setAmountDigits}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="movement-note" className="text-base">
          Motivo (opcional)
        </Label>
        <Input
          id="movement-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: pagamento do entregador"
          className="h-12 text-base"
          maxLength={280}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-busy={pending}
          variant="outline"
          className="h-12 px-6 text-base"
        >
          {pending ? "Registrando…" : "Registrar movimento"}
        </Button>
      </div>
    </section>
  );
}

function CloseForm({
  expected,
  onClosed,
}: {
  expected: number;
  onClosed: (r: { expected: number; counted: number; difference: number }) => void;
}) {
  const [countedDigits, setCountedDigits] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const counted = digitsToNumber(countedDigits);
  const preview =
    countedDigits === "" ? null : Math.round((counted - expected) * 100) / 100;

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.set("counted", digitsToDecimalString(countedDigits));
    if (note.trim()) fd.set("note", note.trim());
    start(async () => {
      const res: CloseSessionResult = await closeSession(fd);
      if (res.ok) {
        onClosed({
          expected: res.expected,
          counted: res.counted,
          difference: res.difference,
        });
        setCountedDigits("");
        setNote("");
      } else {
        setFeedback({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <section className="ring-destructive/20 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1">
      <h2 className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold">
        <LockKeyhole aria-hidden="true" className="size-6" />
        Fechar o caixa
      </h2>
      <p className="text-muted-foreground text-base">
        Conte o dinheiro físico da gaveta e informe o total. O sistema compara
        com o esperado ({formatBRL(expected)}) e mostra a diferença.
      </p>
      <FeedbackBanner feedback={feedback} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CurrencyField
          id="counted-amount"
          label="Dinheiro contado"
          digits={countedDigits}
          onChange={setCountedDigits}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="closing-note" className="text-base">
            Observação (opcional)
          </Label>
          <Input
            id="closing-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: conferido com o caderno"
            className="h-14 text-lg"
            maxLength={280}
          />
        </div>
      </div>
      {preview !== null ? (
        <p className="text-base" aria-live="polite">
          Diferença prevista:{" "}
          <strong
            className={cn(
              "font-semibold tabular-nums",
              Math.abs(preview) < 0.005
                ? "text-success"
                : "text-warning",
            )}
          >
            {Math.abs(preview) < 0.005
              ? formatBRL(0)
              : `${preview > 0 ? "sobra " : "falta "}${formatBRL(Math.abs(preview))}`}
          </strong>
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={submit}
          disabled={pending || countedDigits === ""}
          aria-busy={pending}
          className="h-14 px-8 text-lg font-semibold"
        >
          {pending ? "Fechando…" : "Fechar caixa"}
        </Button>
      </div>
    </section>
  );
}

function ClosedHistory({ sessions }: { sessions: CashSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="minimal:max-sm:text-lg text-xl font-semibold">Caixas fechados recentes</h2>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => {
          const diff = Number(s.difference_amount ?? 0);
          const exact = Math.abs(diff) < 0.005;
          return (
            <li
              key={s.id}
              className="ring-foreground/10 bg-card flex flex-col gap-2 minimal:max-sm:p-3.5 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="text-foreground text-base font-medium">
                  {s.closed_at ? formatDateTime(s.closed_at) : "—"}
                </span>
                <span className="text-muted-foreground text-sm">
                  Esperado {formatBRL(Number(s.expected_amount ?? 0))} · Contado{" "}
                  {formatBRL(Number(s.counted_amount ?? 0))}
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium",
                  exact
                    ? "bg-success/15 text-success"
                    : "bg-warning/15 text-warning",
                )}
              >
                {exact
                  ? "Sem diferença"
                  : `${diff > 0 ? "Sobra" : "Falta"} ${formatBRL(Math.abs(diff))}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
