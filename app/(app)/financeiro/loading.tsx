import { LoadingShell } from "@/components/app/loading-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      {/* Filtros (período + formas de pagamento) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-28 rounded-lg" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* Cartão de faturamento (destaque) */}
      <div className="bg-primary flex flex-col gap-4 rounded-xl p-5">
        <Skeleton className="h-5 w-40 bg-white/25" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-16 bg-white/25" />
              <Skeleton className="h-9 w-28 bg-white/25" />
            </div>
          ))}
        </div>
      </div>

      {/* Lista de vendas */}
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="ring-foreground/10 bg-card flex flex-col gap-2 rounded-xl p-4 ring-1"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-56 max-w-full" />
          </li>
        ))}
      </ul>
    </LoadingShell>
  );
}
