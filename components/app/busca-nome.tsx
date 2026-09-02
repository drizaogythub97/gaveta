"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";

/** Espera depois da última tecla antes de consultar o servidor. */
const ESPERA_MS = 300;

/**
 * Busca por nome que filtra a listagem conforme a pessoa digita.
 *
 * O termo vive na URL, como todo filtro do sistema — o endereço continua
 * compartilhável e o botão voltar funciona. O que muda em relação aos outros
 * filtros é o **ritmo**: navegar a cada tecla renderizaria a lista sete vezes
 * para "bebida". Por isso o campo guarda o que foi digitado e só navega
 * depois de uma pausa curta.
 *
 * O valor visível é do cliente (o campo responde na hora, sem esperar o
 * servidor); o `termoAtual` só reposiciona o campo quando a URL muda por
 * fora — botão voltar, ou o "limpar filtros" da página.
 */
export function BuscaNome({
  param = "q",
  termoAtual,
  rotulo,
  dica,
  placeholder,
}: {
  param?: string;
  /** Termo que está na URL agora (vem do servidor). */
  termoAtual: string;
  rotulo: string;
  dica?: string;
  placeholder?: string;
}) {
  const { pendente, aplicar } = useFiltroNav();
  const [texto, setTexto] = useState(termoAtual);
  const campoId = useId();
  const dicaId = useId();
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoEnviado = useRef(termoAtual);

  // A URL mandou um termo diferente do último que este campo enviou: veio de
  // fora (voltar, limpar, link colado). Só nesse caso o campo se reposiciona,
  // para não brigar com quem está digitando.
  useEffect(() => {
    if (termoAtual !== ultimoEnviado.current) {
      ultimoEnviado.current = termoAtual;
      setTexto(termoAtual);
    }
  }, [termoAtual]);

  useEffect(() => {
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, []);

  function navegar(valor: string) {
    const limpo = valor.trim();
    if (limpo === ultimoEnviado.current) return;
    ultimoEnviado.current = limpo;
    // Termo novo volta à primeira página: a página 3 do termo antigo não
    // quer dizer nada no termo novo.
    aplicar({ [param]: limpo === "" ? null : limpo, page: null });
  }

  function digitou(valor: string) {
    setTexto(valor);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => navegar(valor), ESPERA_MS);
  }

  function limpar() {
    if (relogio.current) clearTimeout(relogio.current);
    setTexto("");
    navegar("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={campoId} className="text-base">
        {rotulo}
      </Label>
      <div className="relative flex items-center">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute left-4 size-5"
        />
        <Input
          id={campoId}
          type="search"
          autoComplete="off"
          value={texto}
          onChange={(e) => digitou(e.target.value)}
          onKeyDown={(e) => {
            // Enter aplica na hora, sem esperar a pausa: quem aperta Enter
            // está dizendo que terminou de digitar.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (relogio.current) clearTimeout(relogio.current);
            navegar(texto);
          }}
          placeholder={placeholder}
          aria-describedby={dica ? dicaId : undefined}
          aria-busy={pendente}
          className="h-12 pr-12 pl-12 text-base"
        />
        {texto !== "" ? (
          <button
            type="button"
            onClick={limpar}
            aria-label="Limpar a busca"
            className="text-muted-foreground hover:text-foreground absolute right-1 flex size-11 items-center justify-center rounded-lg"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
      {dica ? (
        <p id={dicaId} className="text-muted-foreground text-sm">
          {dica}
        </p>
      ) : null}
    </div>
  );
}
