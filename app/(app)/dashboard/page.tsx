import {
  AlertTriangle,
  Boxes,
  Calendar,
  CalendarRange,
  Package,
  Receipt,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";

import { formatBRL } from "@/lib/products/format";
import {
  LOW_STOCK_THRESHOLD,
  monthStartISO,
  todayStartISO,
} from "@/lib/dashboard/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Painel",
};

type Kpi = {
  label: string;
  value: string;
  hint?: string;
  Icon: typeof Calendar;
  tone?: "default" | "warning";
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const greeting =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  const todayStart = todayStartISO();
  const monthStart = monthStartISO();

  const [
    salesToday,
    salesMonth,
    lowStockCount,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("total")
      .eq("status", "completed")
      .gte("created_at", todayStart),
    supabase
      .from("sales")
      .select("total")
      .eq("status", "completed")
      .gte("created_at", monthStart),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("track_stock", true)
      .lte("stock_quantity", LOW_STOCK_THRESHOLD),
  ]);

  const sumTotals = (rows: { total: number }[] | null): number =>
    (rows ?? []).reduce((s, r) => s + Number(r.total), 0);

  const todayRevenue = sumTotals(salesToday.data as { total: number }[] | null);
  const monthRevenue = sumTotals(salesMonth.data as { total: number }[] | null);
  const todayCount = salesToday.data?.length ?? 0;
  const lowStock = lowStockCount.count ?? 0;

  const kpis: Kpi[] = [
    {
      label: "Faturamento hoje",
      value: formatBRL(todayRevenue),
      Icon: Calendar,
    },
    {
      label: "Faturamento do mês",
      value: formatBRL(monthRevenue),
      Icon: CalendarRange,
    },
    {
      label: "Vendas hoje",
      value: todayCount.toString(),
      Icon: ShoppingCart,
    },
    {
      label: "Estoque baixo",
      value: lowStock.toString(),
      hint: `Produtos com ≤ ${LOW_STOCK_THRESHOLD} em estoque`,
      Icon: AlertTriangle,
      tone: lowStock > 0 ? "warning" : "default",
    },
  ];

  const shortcuts = [
    {
      href: "/caixa",
      label: "Frente de caixa",
      description: "Registrar uma nova venda agora.",
      Icon: ShoppingCart,
      featured: true,
    },
    {
      href: "/produtos/novo",
      label: "Cadastrar produto",
      description: "Adicionar um item ao catálogo.",
      Icon: Package,
    },
    {
      href: "/estoque",
      label: "Conferir estoque",
      description: "Ver o que está acabando.",
      Icon: Boxes,
    },
    {
      href: "/financeiro",
      label: "Relatório financeiro",
      description: "Vendas e faturamento por período.",
      Icon: Receipt,
    },
  ];

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Olá, {greeting}!
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Veja como o seu negócio está hoje.
        </p>
      </header>

      <section
        aria-labelledby="kpis-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="kpis-heading" className="sr-only">
          Indicadores
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(({ label, value, hint, Icon, tone }) => (
            <li
              key={label}
              className={cn(
                "ring-foreground/10 bg-card flex flex-col gap-2 rounded-xl p-5 ring-1",
                tone === "warning"
                  ? "ring-warning/30 bg-warning/5"
                  : undefined,
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-base">{label}</span>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-5",
                    tone === "warning"
                      ? "text-warning"
                      : "text-muted-foreground",
                  )}
                />
              </div>
              <p
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  tone === "warning" ? "text-warning" : "text-foreground",
                )}
              >
                {value}
              </p>
              {hint ? (
                <p className="text-muted-foreground text-sm">{hint}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="shortcuts-heading" className="flex flex-col gap-4">
        <h2 id="shortcuts-heading" className="text-xl font-semibold">
          Atalhos rápidos
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shortcuts.map(({ href, label, description, Icon, featured }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex h-full items-center gap-4 rounded-xl p-5 transition-colors",
                  featured
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "ring-foreground/10 bg-card hover:bg-muted ring-1",
                )}
              >
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full",
                    featured ? "bg-primary-foreground/15" : "bg-primary/10",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-6",
                      featured ? "text-primary-foreground" : "text-primary",
                    )}
                  />
                </span>
                <span className="flex flex-col">
                  <span className="text-xl font-semibold">{label}</span>
                  <span
                    className={cn(
                      "text-base",
                      featured
                        ? "text-primary-foreground/85"
                        : "text-muted-foreground",
                    )}
                  >
                    {description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
