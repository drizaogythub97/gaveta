import { ArrowLeft } from "lucide-react";
import { LinkAcao } from "@/components/app/link-acao";

import { FiltroChips } from "@/components/app/filtro-chips";
import { RegiaoEmEspera } from "@/components/app/regiao-em-espera";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/products/format";
import {
  STOCK_MOVEMENT_LABELS,
  type StockMovementRow,
  type StockMovementType,
} from "@/lib/types/stock";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Movimentação de estoque",
};

const MOVEMENT_LIMIT = 100;

const FILTERS: ReadonlyArray<{ value: "todos" | StockMovementType; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "sale", label: "Vendas" },
  { value: "void", label: "Estornos" },
  { value: "restock", label: "Reposições" },
  { value: "purchase", label: "Notas" },
  { value: "adjust", label: "Ajustes" },
];

function pickString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const typeParam = pickString(params.type);
  const validTypes = new Set<StockMovementType>([
    "sale",
    "void",
    "restock",
    "purchase",
    "adjust",
  ]);
  const activeType =
    typeParam && validTypes.has(typeParam as StockMovementType)
      ? (typeParam as StockMovementType)
      : "todos";

  const supabase = await createClient();
  let query = supabase
    .from("stock_movements")
    .select("id, type, quantity, sale_id, note, created_at, products(name)")
    .order("created_at", { ascending: false })
    .limit(MOVEMENT_LIMIT);
  if (activeType !== "todos") {
    query = query.eq("type", activeType);
  }
  const { data, error } = await query;
  const movements = (data ?? []) as unknown as StockMovementRow[];

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <LinkAcao
          href="/estoque"
          className="text-primary inline-flex w-fit items-center gap-2 text-base font-medium underline-offset-4 hover:underline"
          icone={<ArrowLeft aria-hidden="true" className="size-5" />}
        >
          Voltar ao estoque
        </LinkAcao>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Movimentação de estoque
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground text-lg">
          Entradas e saídas dos seus produtos: vendas, estornos, reposições,
          entradas por nota e ajustes. Mostrando os {MOVEMENT_LIMIT} mais
          recentes.
        </p>
      </header>

      <FiltroChips
        param="type"
        rotulo="Filtrar por tipo"
        atual={activeType}
        valorPadrao="todos"
        opcoes={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
      />

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar as movimentações.
        </p>
      ) : movements.length === 0 ? (
        <div className="bg-muted/40 rounded-xl p-8 text-center">
          <p className="text-base">
            Nenhuma movimentação registrada ainda. Vendas, estornos e entradas
            de estoque aparecerão aqui.
          </p>
        </div>
      ) : (
        <RegiaoEmEspera>
          <ul className="flex flex-col gap-2">
            {movements.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </ul>
        </RegiaoEmEspera>
      )}
    </section>
  );
}

function MovementRow({ movement }: { movement: StockMovementRow }) {
  const incoming = movement.quantity >= 0;
  const sign = incoming ? "+" : "−";
  return (
    <li className="ring-foreground/10 bg-card flex items-center justify-between gap-3 minimal:max-sm:p-3.5 rounded-xl p-4 ring-1">
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-lg font-medium">
          {movement.products?.name ?? "Produto removido"}
        </span>
        <span className="text-muted-foreground text-sm">
          {STOCK_MOVEMENT_LABELS[movement.type]} ·{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(movement.created_at))}
        </span>
      </div>
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          incoming ? "text-success" : "text-destructive",
        )}
        aria-label={`${incoming ? "Entrada" : "Saída"} de ${formatQuantity(
          Math.abs(movement.quantity),
        )}`}
      >
        {sign}
        {formatQuantity(Math.abs(movement.quantity))}
      </span>
    </li>
  );
}
