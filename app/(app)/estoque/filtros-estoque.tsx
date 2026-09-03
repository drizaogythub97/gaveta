"use client";

import { useEffect, useId, useRef, useState } from "react";

import { BuscaNome } from "@/components/app/busca-nome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOW_STOCK_THRESHOLD } from "@/lib/dashboard/dates";
import type { FiltrosEstoque } from "@/lib/estoque/filtros";
import { useFiltroNav } from "@/lib/hooks/use-filtro-nav";

/** Espera depois da última tecla nos campos de quantidade. */
const ESPERA_MS = 400;

/**
 * Filtros do Estoque — o mesmo contrato do resto do sistema.
 *
 * Cada campo escreve o seu parâmetro na URL e navega por transição: a lista
 * esmaece no lugar (nível 2) e volta filtrada, sem trocar a tela e sem pular
 * para o topo. Antes isto era estado de React sobre o catálogo inteiro
 * carregado de uma vez — instantâneo, mas sem paginação, sem endereço
 * compartilhável e pesado no celular.
 *
 * Os controles ficam FORA da região que esmaece: quem acabou de tocar num
 * campo precisa continuar mexendo nele enquanto o servidor responde.
 */
export function FiltrosDoEstoque({ filtros }: { filtros: FiltrosEstoque }) {
  const { pendente, aplicar } = useFiltroNav();
  const deId = useId();
  const ateId = useId();
  const minId = useId();
  const maxId = useId();

  return (
    <fieldset className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-4 rounded-xl p-5 ring-1">
      <legend className="text-lg font-semibold">Filtros</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BuscaNome
          termoAtual={filtros.termo}
          rotulo="Nome ou código"
          placeholder="Ex.: refrigerante"
          comCamera
        />
        <CampoData
          id={deId}
          rotulo="Cadastrado a partir de"
          param="from"
          valor={filtros.de}
        />
        <CampoData
          id={ateId}
          rotulo="Cadastrado até"
          param="to"
          valor={filtros.ate}
        />
        <CampoQuantidade
          id={minId}
          rotulo="Quantidade mínima"
          param="min"
          valorAtual={filtros.minTexto}
          placeholder="Ex.: 1"
        />
        <CampoQuantidade
          id={maxId}
          rotulo="Quantidade máxima"
          param="max"
          valorAtual={filtros.maxTexto}
          placeholder={`Ex.: ${LOW_STOCK_THRESHOLD}`}
        />
        <div className="flex items-end">
          <label className="border-border bg-background hover:bg-muted flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 text-base font-medium transition-colors">
            <input
              type="checkbox"
              checked={filtros.soBaixo}
              aria-busy={pendente}
              onChange={(e) =>
                aplicar({ low: e.target.checked ? "1" : null, page: null })
              }
              className="size-5 accent-current"
            />
            Só estoque baixo (≤ {LOW_STOCK_THRESHOLD})
          </label>
        </div>
      </div>
      <LimparFiltros filtros={filtros} />
    </fieldset>
  );
}

/**
 * Data de cadastro. O `<input type="date">` só dispara `change` com uma data
 * completa (ou ao ser limpo), então dá para aplicar na hora — sem a pausa que
 * os campos de texto precisam.
 */
function CampoData({
  id,
  rotulo,
  param,
  valor,
}: {
  id: string;
  rotulo: string;
  param: string;
  valor: string;
}) {
  const { pendente, aplicar } = useFiltroNav();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {rotulo}
      </Label>
      <Input
        id={id}
        type="date"
        value={valor}
        aria-busy={pendente}
        onChange={(e) =>
          aplicar({ [param]: e.target.value || null, page: null })
        }
        className="h-12 text-base"
      />
    </div>
  );
}

/**
 * Quantidade mínima/máxima. Mesmo ritmo da busca por nome: o campo responde
 * na hora e a consulta sai depois de uma pausa curta, senão digitar "100"
 * renderizaria a lista três vezes.
 */
function CampoQuantidade({
  id,
  rotulo,
  param,
  valorAtual,
  placeholder,
}: {
  id: string;
  rotulo: string;
  param: string;
  valorAtual: string;
  placeholder: string;
}) {
  const { pendente, aplicar } = useFiltroNav();
  const [texto, setTexto] = useState(valorAtual);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoEnviado = useRef(valorAtual);

  // A URL trouxe um valor que não foi este campo que mandou: veio de fora
  // (voltar, limpar filtros, link colado). Só aí o campo se reposiciona.
  useEffect(() => {
    if (valorAtual !== ultimoEnviado.current) {
      ultimoEnviado.current = valorAtual;
      setTexto(valorAtual);
    }
  }, [valorAtual]);

  useEffect(() => {
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, []);

  function navegar(valor: string) {
    const limpo = valor.trim();
    if (limpo === ultimoEnviado.current) return;
    ultimoEnviado.current = limpo;
    aplicar({ [param]: limpo === "" ? null : limpo, page: null });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">
        {rotulo}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={texto}
        aria-busy={pendente}
        onChange={(e) => {
          setTexto(e.target.value);
          if (relogio.current) clearTimeout(relogio.current);
          const valor = e.target.value;
          relogio.current = setTimeout(() => navegar(valor), ESPERA_MS);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (relogio.current) clearTimeout(relogio.current);
          navegar(texto);
        }}
        placeholder={placeholder}
        className="h-12 text-base"
      />
    </div>
  );
}

function LimparFiltros({ filtros }: { filtros: FiltrosEstoque }) {
  const { aplicar } = useFiltroNav();

  const temFiltro =
    filtros.termo !== "" ||
    filtros.de !== "" ||
    filtros.ate !== "" ||
    filtros.minTexto !== "" ||
    filtros.maxTexto !== "" ||
    filtros.soBaixo;

  if (!temFiltro) return null;

  return (
    <button
      type="button"
      onClick={() =>
        aplicar({
          q: null,
          from: null,
          to: null,
          min: null,
          max: null,
          low: null,
          page: null,
        })
      }
      className="text-primary self-start text-base font-medium underline underline-offset-4 hover:no-underline"
    >
      Limpar filtros
    </button>
  );
}
