// Constantes e helpers de período para os dashboards.
//
// Toda borda de dia sai no fuso da LOJA, nunca no do servidor. Na Vercel o
// servidor é UTC: com o fuso do servidor, o dia virava às 21h de Brasília e
// a venda da noite caía no relatório do dia seguinte — no Painel, no
// Financeiro, no Fechamento e nos filtros do Estoque. Ver o achado A de
// `docs/10-ACHADOS-DE-LOGICA.md`.

export const LOW_STOCK_THRESHOLD = 5;

/**
 * Fuso da loja. Decisão do dono (2026-09-10): **fixo**, igual para todas as
 * contas, e não configurável por usuário — o público é de lojistas
 * brasileiros e uma preferência a mais é uma chance a mais de o relatório
 * sair errado sem ninguém entender por quê.
 */
export const FUSO_LOJA = "America/Sao_Paulo";

export type Period = "today" | "7d" | "30d" | "month" | "custom";

/**
 * Fuso usado para calcular as bordas dos períodos — e o MESMO que vai ao
 * banco como `p_tz`. Quem agrupa por dia precisa receber este valor, senão a
 * soma dos dias não fecha com o total do período.
 */
export function periodTimeZone(): string {
  return FUSO_LOJA;
}

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Mês atual",
  custom: "Personalizado",
};

/**
 * Relógio de parede da loja num instante. `en-CA` porque devolve as partes
 * já em ordem numérica estável; o que importa é o `timeZone`.
 */
const PARTES_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_LOJA,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Partes = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

function partesNoFuso(instante: Date): Partes {
  const p: Record<string, string> = {};
  for (const parte of PARTES_FMT.formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // Meia-noite sai como "24" em alguns motores.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Deslocamento do fuso da loja, em milissegundos, NAQUELE instante. */
function deslocamento(instante: Date): number {
  const p = partesNoFuso(instante);
  const comoSeFosseUTC = Date.UTC(
    p.ano,
    p.mes - 1,
    p.dia,
    p.hora,
    p.minuto,
    p.segundo,
    instante.getUTCMilliseconds(),
  );
  return comoSeFosseUTC - instante.getTime();
}

/**
 * Instante cujo relógio de parede na loja é o que se pede.
 *
 * Duas passadas: a primeira estima o deslocamento pela data ingênua, a
 * segunda o confirma já perto do instante certo. É o que mantém a conta
 * correta se o horário de verão voltar — hoje o Brasil não tem, e por isso
 * uma passada só bastaria; a segunda custa nada e evita um erro de uma hora
 * difícil de achar depois.
 */
function instanteNaLoja(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
  ms = 0,
): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  const estimado = new Date(alvo - deslocamento(new Date(alvo)));
  return new Date(alvo - deslocamento(estimado));
}

function startOfDay(d: Date): Date {
  const p = partesNoFuso(d);
  return instanteNaLoja(p.ano, p.mes, p.dia);
}

function endOfDay(d: Date): Date {
  const p = partesNoFuso(d);
  return instanteNaLoja(p.ano, p.mes, p.dia, 23, 59, 59, 999);
}

/** Recua dias no CALENDÁRIO da loja, não no instante. */
function menosDias(d: Date, dias: number): Date {
  const p = partesNoFuso(d);
  const base = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
  base.setUTCDate(base.getUTCDate() - dias);
  return instanteNaLoja(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
  );
}

export function todayStartISO(): string {
  return startOfDay(new Date()).toISOString();
}

export function monthStartISO(): string {
  const p = partesNoFuso(new Date());
  return instanteNaLoja(p.ano, p.mes, 1).toISOString();
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
    return { from: menosDias(now, 6).toISOString(), to };
  }
  if (period === "30d") {
    return { from: menosDias(now, 29).toISOString(), to };
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

/**
 * Borda inicial de um dia digitado em `<input type="date">`, em ISO.
 *
 * Devolve `null` quando o valor não é uma data no formato `AAAA-MM-DD` —
 * parâmetro inventado na URL não deve virar filtro silencioso. O dia é o da
 * loja: 00:00 em Brasília.
 */
export function dayStartISO(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return parseDateInput(value).toISOString();
}

/** Borda final (23:59:59.999 em Brasília) do mesmo dia. Ver {@link dayStartISO}. */
export function dayEndISO(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return endOfDayFromInput(value).toISOString();
}

function parseDateInput(value: string): Date {
  // value vem como "YYYY-MM-DD" do <input type="date"> e é uma data PURA:
  // vira meia-noite na loja, não meia-noite UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return startOfDay(new Date());
  return instanteNaLoja(Number(m[1]), Number(m[2]), Number(m[3]));
}

function endOfDayFromInput(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return endOfDay(new Date());
  return instanteNaLoja(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    23,
    59,
    59,
    999,
  );
}

/** Data pura da loja ("AAAA-MM-DD") a partir de um instante ISO. */
export function toDateInputValue(iso: string): string {
  const p = partesNoFuso(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
}

/** Hoje na loja, como data pura ("AAAA-MM-DD"). */
export function hojeNaLoja(): string {
  return toDateInputValue(new Date().toISOString());
}

// Os dois formatadores abaixo fixam o fuso da loja de propósito: sem isso,
// o servidor (UTC) e o navegador de quem olha formatariam horas diferentes
// para o mesmo instante — e a mesma tela mostraria uma coisa no HTML do
// servidor e outra depois de hidratar.
const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
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
