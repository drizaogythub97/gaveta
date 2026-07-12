"use client";

import {
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Painel", Icon: LayoutDashboard },
  { href: "/caixa", label: "Caixa", Icon: ShoppingCart },
  { href: "/produtos", label: "Produtos", Icon: Package },
  { href: "/estoque", label: "Estoque", Icon: Boxes },
  { href: "/financeiro", label: "Financeiro", Icon: Receipt },
  { href: "/configuracoes", label: "Configurações", Icon: Settings },
] as const;

// Rotas de configurações que vivem fora de /configuracoes mas pertencem à aba.
const CONFIG_ROTAS = ["/preferencias", "/minha-conta"] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="minimal:max-sm:hidden border-border bg-background border-t"
    >
      {/* Mobile: grid uniforme de 2 colunas (3 linhas exatas com 6 itens) —
          o flex-wrap gerava linhas assimétricas. Desktop: flex. */}
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-1 px-2 py-1 sm:flex sm:flex-wrap sm:items-stretch sm:py-0">
        {ITEMS.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/configuracoes" &&
              CONFIG_ROTAS.some(
                (rota) =>
                  pathname === rota || pathname.startsWith(`${rota}/`),
              ));
          return (
            <li key={href} className="sm:flex-initial">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-md px-3 text-base font-medium transition-colors sm:h-14 sm:min-w-[80px]",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
