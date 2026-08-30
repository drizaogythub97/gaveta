/** Abas do Financeiro — compartilhadas entre a página (servidor) e a nav. */

export const TABS = ["vendas", "despesas", "fechamento", "resumo"] as const;

export type Tab = (typeof TABS)[number];

export const TAB_LABELS: Record<Tab, string> = {
  vendas: "Vendas",
  despesas: "Despesas",
  fechamento: "Fechamento",
  resumo: "Resumo",
};

export function parseTab(value: string | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "vendas";
}
