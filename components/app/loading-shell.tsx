import { Skeleton } from "@/components/ui/skeleton";

/**
 * Casca padrão das telas de carregamento: anuncia "Carregando…" para leitores
 * de tela (`role="status"`) e mostra o esqueleto do cabeçalho (título +
 * subtítulo). O conteúdo específico de cada rota entra como `children`.
 */
export function LoadingShell({ children }: { children?: React.ReactNode }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-8"
    >
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      {children}
    </section>
  );
}
