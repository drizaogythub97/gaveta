import { ArrowUpRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { FIADOAPP_URL } from "@/lib/ecossistema";
import { cn } from "@/lib/utils";

/**
 * App switcher do ecossistema (estágio 1): abre o outro app da família em
 * nova aba — a conta é a mesma. No Minimalista (mobile) o header some;
 * o equivalente vive no painel "Mais" da barra inferior.
 */
export function AppSwitcher() {
  return (
    <a
      href={FIADOAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-12 gap-1.5 px-4 text-base",
      )}
      aria-label="Abrir o FiadoApp (mesma conta, nova aba)"
    >
      FiadoApp
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </a>
  );
}
