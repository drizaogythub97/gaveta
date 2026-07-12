"use client";

import { Blocks, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const COOKIE = "gaveta_ecossistema_anuncio";

// Fora do componente: a regra react-hooks/immutability barra atribuição a
// globais (document.cookie) dentro dele.
function dispensarAnuncio() {
  document.cookie = `${COOKIE}=off; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Anúncio ÚNICO e dispensável do ecossistema no Painel (descoberta).
 * O servidor só renderiza quando o cookie não existe; dispensar grava o
 * cookie e some para sempre. O card permanente fica em Configurações.
 */
export function EcossistemaAnuncio() {
  const [dispensado, setDispensado] = useState(false);
  if (dispensado) return null;

  return (
    <aside
      aria-label="Novidade do ecossistema"
      className="ring-primary/25 bg-primary/5 minimal:max-sm:p-3.5 relative flex items-start gap-3 rounded-xl p-4 ring-1"
    >
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <Blocks aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1 pr-8">
        <p className="minimal:max-sm:text-sm text-base font-semibold">
          Conheça o FiadoApp, o app de vendas a prazo da mesma família
        </p>
        <p className="minimal:max-sm:text-xs text-muted-foreground text-sm">
          Caderno de fiado digital com a mesma conta do Gaveta.{" "}
          <Link
            href="/ecossistema"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Saiba mais
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          dispensarAnuncio();
          setDispensado(true);
        }}
        aria-label="Dispensar anúncio"
        className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-2 right-2 flex size-9 items-center justify-center rounded-lg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </aside>
  );
}
