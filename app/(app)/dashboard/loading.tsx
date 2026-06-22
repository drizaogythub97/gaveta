import { LoadingShell } from "@/components/app/loading-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      {/* Indicadores (KPIs) */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-5 ring-1"
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-24" />
          </li>
        ))}
      </ul>

      {/* Atalhos rápidos */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="ring-foreground/10 bg-card flex items-center gap-4 rounded-xl p-5 ring-1"
            >
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-5 w-56 max-w-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </LoadingShell>
  );
}
