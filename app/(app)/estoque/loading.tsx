import { LoadingShell } from "@/components/app/loading-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      {/* Busca / filtro */}
      <Skeleton className="h-14 w-full max-w-md rounded-lg" />

      {/* Lista de itens de estoque */}
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-12 w-40 rounded-lg" />
          </li>
        ))}
      </ul>
    </LoadingShell>
  );
}
