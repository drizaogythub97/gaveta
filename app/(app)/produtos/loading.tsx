import { LoadingShell } from "@/components/app/loading-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingShell>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-44" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-12 w-24 rounded-lg" />
              <Skeleton className="h-12 w-24 rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </LoadingShell>
  );
}
