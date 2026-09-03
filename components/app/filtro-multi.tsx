"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";
import { cn } from "@/lib/utils";

export type OpcaoMulti = { value: string; label: string };

/**
 * Lista suspensa que filtra por **vários** valores do mesmo parâmetro.
 *
 * Substitui a fileira de chips quando as opções crescem: com trinta
 * categorias, os chips viravam um paredão que empurrava a lista para fora da
 * tela do celular. Aqui o filtro ocupa uma linha, e as opções aparecem só
 * quando pedidas.
 *
 * Regras que valem a pena conhecer:
 *
 * - **É OU, não E.** Marcar "Bebidas" e "Limpeza" mostra o que for de
 *   qualquer uma das duas — decisão do dono do produto.
 * - **Aplica na hora.** Cada marcação já navega, dentro de uma transição
 *   (`useFiltroNav`), preservando o resto da query. Não há botão "aplicar":
 *   um passo a mais é um passo a mais para errar.
 * - **O painel não fecha ao marcar**, porque quase sempre se marca mais de
 *   uma. Fecha no Escape, no clique fora e no botão.
 */
export function FiltroMulti({
  param,
  opcoes,
  selecionados,
  rotulo,
  textoVazio,
}: {
  /** Nome do parâmetro repetido na URL (ex.: "tag"). */
  param: string;
  opcoes: OpcaoMulti[];
  /** Valores marcados agora, lidos da URL pelo servidor. */
  selecionados: string[];
  /** Rótulo do filtro, também usado pelo leitor de tela. */
  rotulo: string;
  /** Texto do botão quando nada está marcado (ex.: "Todas as categorias"). */
  textoVazio: string;
}) {
  const { pendente, aplicar } = useFiltroNav();
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const painelId = useId();

  // Fecha ao clicar fora ou apertar Escape — sem isso o painel fica preso
  // aberto no celular, cobrindo a lista que a pessoa quer ver.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      if (!caixaRef.current?.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function alternar(valor: string) {
    const proximo = selecionados.includes(valor)
      ? selecionados.filter((v) => v !== valor)
      : [...selecionados, valor];
    // Recorte novo volta à primeira página: a página 3 do recorte antigo
    // não quer dizer nada no recorte novo.
    aplicar({ [param]: proximo, page: null });
  }

  function limpar() {
    aplicar({ [param]: null, page: null });
    setAberto(false);
  }

  const marcados = opcoes.filter((o) => selecionados.includes(o.value));
  const resumo =
    marcados.length === 0
      ? textoVazio
      : marcados.length === 1
        ? marcados[0].label
        : `${marcados.length} categorias`;

  return (
    <div className="flex flex-col gap-2" ref={caixaRef}>
      {/* Rótulo visível, como o campo de busca ao lado: controle sem rótulo
          obriga a adivinhar, e adivinhar é exatamente o que este público não
          deveria precisar fazer. O `aria-label` do botão repete o rótulo e
          acrescenta o que está marcado. */}
      <span id={`${painelId}-rotulo`} className="text-base font-medium">
        {rotulo}
      </span>
      <div className="relative flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls={painelId}
          aria-label={`${rotulo}: ${resumo}`}
          aria-busy={pendente}
          className={cn(
            "border-border hover:bg-muted flex h-12 min-w-52 items-center justify-between gap-3 rounded-lg border px-4 text-base font-medium transition-colors",
            marcados.length > 0 && "border-primary text-primary",
          )}
        >
          <span className="truncate">{resumo}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn("size-5 shrink-0 transition-transform", aberto && "rotate-180")}
          />
        </button>

        {marcados.length > 0 ? (
          <button
            type="button"
            onClick={limpar}
            className="text-muted-foreground hover:text-foreground flex h-12 items-center gap-1.5 rounded-lg px-3 text-base underline underline-offset-4"
          >
            <X aria-hidden="true" className="size-4" />
            Limpar
          </button>
        ) : null}

        {aberto ? (
          <div
            id={painelId}
            role="group"
            aria-label={rotulo}
            className="bg-card ring-foreground/10 absolute top-14 left-0 z-30 flex max-h-80 w-full min-w-64 flex-col gap-1 overflow-y-auto rounded-xl p-2 shadow-lg ring-1 sm:w-80"
          >
            {opcoes.length === 0 ? (
              <p className="text-muted-foreground p-3 text-base">
                Nenhuma categoria cadastrada ainda.
              </p>
            ) : (
              opcoes.map((opcao) => {
                const marcado = selecionados.includes(opcao.value);
                return (
                  <button
                    key={opcao.value}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => alternar(opcao.value)}
                    className={cn(
                      "hover:bg-muted flex h-12 items-center gap-3 rounded-lg px-3 text-left text-base transition-colors",
                      marcado && "text-primary font-medium",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md border",
                        marcado
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {marcado ? <Check className="size-4" /> : null}
                    </span>
                    <span className="truncate">{opcao.label}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {/* Fora do painel, para continuar visível depois de fechar: mostra o
          recorte ativo sem obrigar a reabrir a lista. */}
      {marcados.length > 1 ? (
        <p className="text-muted-foreground text-sm">
          Mostrando produtos de: {marcados.map((m) => m.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
