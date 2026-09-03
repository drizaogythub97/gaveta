"use client";

import { Check, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductTag } from "@/lib/types/db";
import { cn } from "@/lib/utils";

/**
 * Escolha de categorias do produto.
 *
 * A categoria nasce ORGANICAMENTE: quem cadastra digita o nome e ela passa
 * a existir, sem tela de "gerenciar categorias" antes. As que já existem
 * aparecem como botões para marcar; as novas viram etiquetas até salvar.
 *
 * Manda dois campos para o servidor, e é o servidor que decide o que criar:
 *   `tagIds`  — as existentes, por id;
 *   `newTags` — as digitadas agora, por nome.
 */
export function TagPicker({
  disponiveis,
  idsIniciais = [],
  /** Prefixo dos nomes dos campos (o form da nota tem vários blocos). */
  nomeCampoIds = "tagIds",
  nomeCampoNovas = "newTags",
  /** Quando presente, o componente vira controlado (formulário sem <form>). */
  onChange,
  /**
   * Quando presente, a categoria digitada é criada NO SERVIDOR na hora, em
   * vez de esperar o formulário ser salvo. É o que a entrada por nota
   * precisa: quem cadastra vários produtos seguidos tem de encontrar, no
   * segundo, a categoria que criou no primeiro. Devolve a categoria (nova ou
   * já existente) ou uma mensagem de erro.
   */
  aoCriar,
  max = 12,
}: {
  disponiveis: ProductTag[];
  idsIniciais?: string[];
  nomeCampoIds?: string;
  nomeCampoNovas?: string;
  onChange?: (valor: { tagIds: string[]; newTags: string[] }) => void;
  aoCriar?: (nome: string) => Promise<{ tag?: ProductTag; error?: string }>;
  max?: number;
}) {
  const [marcadas, setMarcadas] = useState<string[]>(idsIniciais);
  const [novas, setNovas] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoId = useId();

  const total = marcadas.length + novas.length;
  const cheio = total >= max;

  function avisar(proxIds: string[], proxNovas: string[]) {
    onChange?.({ tagIds: proxIds, newTags: proxNovas });
  }

  function alternar(id: string) {
    const marcada = marcadas.includes(id);
    if (!marcada && cheio) return;
    const prox = marcada
      ? marcadas.filter((x) => x !== id)
      : [...marcadas, id];
    setMarcadas(prox);
    avisar(prox, novas);
  }

  function adicionarRascunho() {
    const nome = rascunho.trim();
    if (nome === "" || cheio || criando) return;
    setErro(null);

    // Se já existe uma categoria com esse nome, marca a existente em vez de
    // criar uma quase igual — é o que o índice único do banco faria de
    // qualquer jeito, e aqui a pessoa vê acontecer.
    const chave = nome.toLocaleLowerCase("pt-BR");
    const existente = disponiveis.find(
      (t) => t.name.trim().toLocaleLowerCase("pt-BR") === chave,
    );
    if (existente) {
      setRascunho("");
      if (!marcadas.includes(existente.id)) alternar(existente.id);
      return;
    }
    if (novas.some((n) => n.toLocaleLowerCase("pt-BR") === chave)) {
      setRascunho("");
      return;
    }

    // Com `aoCriar`, a categoria nasce no banco agora e já entra marcada por
    // id — some da lista de "novas", porque de nova não tem mais nada.
    if (aoCriar) {
      setCriando(true);
      void aoCriar(nome)
        .then(({ tag, error }) => {
          if (!tag) {
            setErro(error ?? "Não foi possível criar a categoria.");
            return;
          }
          setRascunho("");
          if (!marcadas.includes(tag.id)) {
            const prox = [...marcadas, tag.id];
            setMarcadas(prox);
            avisar(prox, novas);
          }
        })
        .finally(() => setCriando(false));
      return;
    }

    const prox = [...novas, nome];
    setNovas(prox);
    setRascunho("");
    avisar(marcadas, prox);
  }

  function removerNova(nome: string) {
    const prox = novas.filter((n) => n !== nome);
    setNovas(prox);
    avisar(marcadas, prox);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-base font-medium">
        Categorias{" "}
        <span className="text-muted-foreground font-normal">(opcional)</span>
      </legend>
      <p className="text-muted-foreground text-sm">
        Servem para achar e agrupar seus produtos. Digite uma categoria nova ou
        marque as que já usa.
      </p>

      {/* Só os campos ocultos vão para a Server Action: o estado visual fica
          no cliente, e o servidor recebe listas simples. */}
      {onChange
        ? null
        : marcadas.map((id) => (
            <input key={id} type="hidden" name={nomeCampoIds} value={id} />
          ))}
      {onChange
        ? null
        : novas.map((nome) => (
            <input
              key={nome}
              type="hidden"
              name={nomeCampoNovas}
              value={nome}
            />
          ))}

      {disponiveis.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {disponiveis.map((tag) => {
            const marcada = marcadas.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={marcada}
                disabled={!marcada && cheio}
                onClick={() => alternar(tag.id)}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-full border px-4 text-base font-medium transition-colors disabled:opacity-50",
                  marcada
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted bg-transparent",
                )}
              >
                {marcada ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                ) : null}
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {novas.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {novas.map((nome) => (
            <li key={nome}>
              <span className="border-primary bg-primary/10 text-primary flex h-11 items-center gap-2 rounded-full border px-4 text-base font-medium">
                {nome}
                <span className="text-muted-foreground text-xs">nova</span>
                <button
                  type="button"
                  onClick={() => removerNova(nome)}
                  aria-label={`Remover categoria ${nome}`}
                  className="hover:bg-primary/20 flex size-6 items-center justify-center rounded-full"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={campoId} className="text-sm">
            Criar categoria
          </Label>
          <Input
            id={campoId}
            type="text"
            autoComplete="off"
            value={rascunho}
            disabled={cheio || criando}
            maxLength={30}
            placeholder="Ex.: Bebidas"
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              // Enter aqui adiciona a categoria — não envia o formulário
              // inteiro, que é o que a pessoa menos espera nesse momento.
              if (e.key !== "Enter") return;
              e.preventDefault();
              adicionarRascunho();
            }}
            className="h-12 text-base"
          />
        </div>
        <button
          type="button"
          onClick={adicionarRascunho}
          disabled={cheio || criando || rascunho.trim() === ""}
          aria-busy={criando}
          className="border-border text-foreground hover:bg-muted flex h-12 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-5" />
          {criando ? "Criando…" : "Adicionar"}
        </button>
      </div>

      {erro ? (
        <p className="text-destructive text-sm" role="alert">
          {erro}
        </p>
      ) : null}

      {cheio ? (
        <p className="text-muted-foreground text-sm" role="status">
          Máximo de {max} categorias por produto.
        </p>
      ) : null}
    </fieldset>
  );
}
