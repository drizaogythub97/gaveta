"use client";

import { Check, Search, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  criarFiadoCliente,
  searchFiadoClientes,
  type FiadoCliente,
} from "./fiado-actions";

function nomeCompleto(c: FiadoCliente): string {
  const base = c.sobrenome ? `${c.nome} ${c.sobrenome}` : c.nome;
  return c.referencia ? `${base} (${c.referencia})` : base;
}

/**
 * Seletor de cliente do FiadoApp para o bloco de venda a prazo do caixa:
 * clicável (carrega todos) e digitável (filtra conforme digita), com a
 * opção "Cadastrar Novo Cliente" inline. Reporta o cliente escolhido ao pai.
 */
export function FiadoClienteCombobox({
  value,
  onChange,
  disabled,
}: {
  value: FiadoCliente | null;
  onChange: (cliente: FiadoCliente | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<FiadoCliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [buscando, startBusca] = useTransition();

  // Formulário de cliente novo.
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [referencia, setReferencia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca com debounce enquanto o painel está aberto (sem cliente escolhido).
  useEffect(() => {
    if (!aberto || value) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startBusca(async () => {
        setResultados(await searchFiadoClientes(query));
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, aberto, value]);

  function selecionar(c: FiadoCliente) {
    onChange(c);
    setAberto(false);
    setQuery("");
  }

  function limparSelecao() {
    onChange(null);
    setAberto(true);
  }

  function salvarNovo() {
    setErro(null);
    startSalvar(async () => {
      const result = await criarFiadoCliente({
        nome,
        sobrenome,
        referencia,
        telefone,
      });
      if (!result.ok) {
        setErro(result.error);
        return;
      }
      // Cliente criado é selecionado automaticamente.
      onChange(result.cliente);
      setCadastrando(false);
      setAberto(false);
      setNome("");
      setSobrenome("");
      setReferencia("");
      setTelefone("");
    });
  }

  // ── Cliente já escolhido ──────────────────────────────────────────
  if (value) {
    return (
      <div className="border-primary/40 bg-primary/5 flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="flex min-w-0 items-center gap-2">
          <Check aria-hidden="true" className="text-primary size-5 shrink-0" />
          <span className="truncate text-lg font-medium">
            {nomeCompleto(value)}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={limparSelecao}
          disabled={disabled}
          className="h-10 shrink-0 px-3 text-sm"
        >
          Trocar
        </Button>
      </div>
    );
  }

  // ── Formulário de cliente novo ────────────────────────────────────
  if (cadastrando) {
    return (
      <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fiado-novo-nome" className="text-base">
            Nome *
          </Label>
          <Input
            id="fiado-novo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            className="h-12 text-base"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fiado-novo-sobrenome" className="text-base">
              Sobrenome
            </Label>
            <Input
              id="fiado-novo-sobrenome"
              value={sobrenome}
              onChange={(e) => setSobrenome(e.target.value)}
              autoComplete="off"
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fiado-novo-referencia" className="text-base">
              Referência
            </Label>
            <Input
              id="fiado-novo-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ex.: Filho, Loja"
              autoComplete="off"
              className="h-12 text-base"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fiado-novo-telefone" className="text-base">
            Telefone
          </Label>
          <Input
            id="fiado-novo-telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="Para cobrar pelo WhatsApp"
            className="h-12 text-base"
          />
        </div>
        {erro ? <p className="text-destructive text-sm">{erro}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCadastrando(false);
              setErro(null);
            }}
            disabled={salvando}
            className="h-12 px-5 text-base"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvarNovo}
            disabled={salvando || nome.trim().length === 0}
            aria-busy={salvando}
            className="h-12 px-5 text-base font-medium"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Busca / seleção ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setAberto(true)}
          disabled={disabled}
          placeholder="Buscar cliente pelo nome"
          aria-label="Buscar cliente do FiadoApp"
          className="h-12 pl-10 text-base"
        />
      </div>

      {aberto ? (
        <div className="border-border max-h-60 overflow-y-auto rounded-lg border">
          {buscando ? (
            <p className="text-muted-foreground p-3 text-sm">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {query.trim()
                ? "Nenhum cliente encontrado."
                : "Nenhum cliente cadastrado ainda."}
            </p>
          ) : (
            <ul>
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selecionar(c)}
                    className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2.5 text-left text-base"
                  >
                    {nomeCompleto(c)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setCadastrando(true);
          setAberto(false);
        }}
        disabled={disabled}
        className="h-12 justify-start gap-2 px-4 text-base"
      >
        <UserPlus aria-hidden="true" className="size-5" />
        Cadastrar Novo Cliente
      </Button>
    </div>
  );
}
