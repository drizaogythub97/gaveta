export const SALE_SORTS = ["recent", "oldest", "high", "low"] as const;
export type SaleSort = (typeof SALE_SORTS)[number];

export const SORT_LABELS: Record<SaleSort, string> = {
  recent: "Mais recentes primeiro",
  oldest: "Mais antigas primeiro",
  high: "Maior valor primeiro",
  low: "Menor valor primeiro",
};
