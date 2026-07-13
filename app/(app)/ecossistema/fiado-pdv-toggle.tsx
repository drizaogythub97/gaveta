"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResumoFiadoPdv } from "@/lib/ecossistema-server";
import { formatBRL } from "@/lib/products/format";
import { cn } from "@/lib/utils";

import { desativarFiadoPdv, salvarFiadoPdv } from "./actions";

/**
 * Toggle da ponte "Venda a prazo no caixa" (F6). Ativar é simples; DESATIVAR
 * pede senha (registros financeiros) e deixa escolher Manter ou Excluir as
 * vendas a prazo já lançadas no caixa.
 */
export function FiadoPdvToggle({
  ativoInicial,
  resumo,
}: {
  ativoInicial: boolean;
  resumo: ResumoFiadoPdv;
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(ativoInicial);
  const [pending, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState(false);
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"manter" | "excluir">("manter");

  function ativar() {
    if (ativo || pending) return;
    startTransition(async () => {
      const { error } = await salvarFiadoPdv(true);
      if (error) {
        toast.error(error);
        return;
      }
      setAtivo(true);
      toast.success("Venda a prazo liberada no caixa.");
      router.refresh();
    });
  }

  function pedirDesativar() {
    if (!ativo || pending) return;
    setSenha("");
    setModo("manter");
    setDialogo(true);
  }

  function confirmarDesativar() {
    if (!senha) {
      toast.error("Informe sua senha.");
      return;
    }
    startTransition(async () => {
      const result = await desativarFiadoPdv(senha, modo);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível desativar.");
        return;
      }
      setAtivo(false);
      setDialogo(false);
      toast.success(
        modo === "excluir"
          ? "Venda a prazo desativada e vendas excluídas."
          : "Venda a prazo desativada.",
      );
      router.refresh();
    });
  }

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Venda a prazo no caixa"
        className="minimal:max-sm:grid minimal:max-sm:grid-cols-2 flex flex-wrap gap-2"
      >
        <Button
          type="button"
          role="radio"
          aria-checked={ativo}
          disabled={pending}
          variant={ativo ? "default" : "outline"}
          onClick={ativar}
          className="minimal:max-sm:h-11 minimal:max-sm:px-2 minimal:max-sm:text-sm h-12 px-5 text-base"
        >
          <Check aria-hidden="true" className="size-5" />
          Ativado
        </Button>
        <Button
          type="button"
          role="radio"
          aria-checked={!ativo}
          disabled={pending}
          variant={!ativo ? "default" : "outline"}
          onClick={pedirDesativar}
          className="minimal:max-sm:h-11 minimal:max-sm:px-2 minimal:max-sm:text-sm h-12 px-5 text-base"
        >
          <X aria-hidden="true" className="size-5" />
          Desativado
        </Button>
      </div>

      <ConfirmDialog
        open={dialogo}
        onClose={() => {
          if (!pending) setDialogo(false);
        }}
        title="Desativar venda a prazo no caixa"
        description={
          resumo.total > 0 ? (
            <>
              Você tem{" "}
              <strong className="text-foreground">
                {resumo.total}{" "}
                {resumo.total === 1 ? "venda a prazo" : "vendas a prazo"}
              </strong>{" "}
              lançada{resumo.total === 1 ? "" : "s"} no caixa
              {resumo.aReceber > 0 ? (
                <> ({formatBRL(resumo.aReceber)} ainda a receber)</>
              ) : null}
              . O que fazer com {resumo.total === 1 ? "ela" : "elas"}?
            </>
          ) : (
            <>
              Confirme sua senha para desativar a venda a prazo no caixa. A
              opção some do caixa.
            </>
          )
        }
        confirmLabel="Desativar"
        confirmVariant="destructive"
        onConfirm={confirmarDesativar}
        pending={pending}
      >
        <div className="flex flex-col gap-4">
          {resumo.total > 0 ? (
            <div
              role="radiogroup"
              aria-label="O que fazer com as vendas a prazo"
              className="flex flex-col gap-2"
            >
              <ModoBtn
                ativo={modo === "manter"}
                onClick={() => setModo("manter")}
                titulo="Manter vendas"
                descricao="Só desliga a opção. As vendas a prazo continuam no FiadoApp e no seu financeiro."
              />
              <ModoBtn
                ativo={modo === "excluir"}
                onClick={() => setModo("excluir")}
                titulo="Excluir vendas"
                descricao="Apaga todas as vendas a prazo do caixa nos dois apps e devolve o estoque."
                perigo
              />
              {modo === "excluir" && resumo.comPagamento > 0 ? (
                <p className="text-destructive flex items-start gap-1.5 text-sm">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {resumo.comPagamento}{" "}
                  {resumo.comPagamento === 1
                    ? "venda já tem pagamento"
                    : "vendas já têm pagamento"}{" "}
                  — o histórico de recebimento será apagado.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-desativar" className="text-base">
              Sua senha
            </Label>
            <Input
              id="senha-desativar"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-12 text-base"
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}

function ModoBtn({
  ativo,
  onClick,
  titulo,
  descricao,
  perigo,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  descricao: string;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border p-3 text-left",
        ativo
          ? perigo
            ? "border-destructive bg-destructive/5"
            : "border-primary bg-primary/5"
          : "border-border hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "text-base font-medium",
          perigo && ativo ? "text-destructive" : "text-foreground",
        )}
      >
        {titulo}
      </span>
      <span className="text-muted-foreground text-sm">{descricao}</span>
    </button>
  );
}
