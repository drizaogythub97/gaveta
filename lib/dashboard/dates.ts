// Constantes e helpers de período para os dashboards.
// Datas são calculadas na timezone do servidor — em produção (Vercel) isso é
// UTC; em dev local segue o sistema operacional. Para um lojista brasileiro,
// uma evolução futura pode adicionar configuração de timezone por usuário.

export const LOW_STOCK_THRESHOLD = 5;

export type Period = "today" | "7d" | "30d" | "month" | "custom";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Mês atual",
  custom: "Personalizado",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function todayStartISO(): string {
  return startOfDay(new Date()).toISOString();
}

export function monthStartISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

export function rangeForPeriod(
  period: Period,
  fromInput?: string,
  toInput?: string,
): { from: string; to: string } {
  const now = new Date();
  const to = endOfDay(now).toISOString();

  if (period === "today") {
    return { from: startOfDay(now).toISOString(), to };
  }
  if (period === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: startOfDay(from).toISOString(), to };
  }
  if (period === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: startOfDay(from).toISOString(), to };
  }
  if (period === "month") {
    return { from: monthStartISO(), to };
  }

  // custom
  const fromDate = fromInput ? parseDateInput(fromInput) : startOfDay(now);
  const toDate = toInput ? endOfDayFromInput(toInput) : endOfDay(now);
  return {
    from: startOfDay(fromDate).toISOString(),
    to: endOfDay(toDate).toISOString(),
  };
}

function parseDateInput(value: string): Date {
  // value vem como "YYYY-MM-DD" do <input type="date">; tratar como local.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date();
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function endOfDayFromInput(value: string): Date {
  return endOfDay(parseDateInput(value));
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formata uma data pura ("YYYY-MM-DD") como "DD/MM/YYYY" SEM passar por
 * Date — `new Date("2026-08-20")` é meia-noite UTC e, no fuso do Brasil,
 * voltaria um dia.
 */
export function formatDateOnly(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATETIME_FMT.format(new Date(iso));
}
