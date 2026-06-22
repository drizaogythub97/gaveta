import { cn } from "@/lib/utils";

/**
 * Placeholder de carregamento. A pulsação só roda quando o usuário NÃO pediu
 * movimento reduzido (`motion-safe`), mantendo o app sóbrio e acessível.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-muted rounded-md motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
