"use client";

import { FileUp, Loader2, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { NotaConferencia } from "@/lib/compras/tipos";

import { importarNotaComIa, importarNotaDeArquivo } from "./import-actions";

/**
 * Importar a nota de um arquivo (fases G2b, G2c e G2d).
 *
 * O caminho padrão lê tudo no PRÓPRIO servidor do Gaveta — XML, PDF com
 * texto e, para foto, OCR local. Nada sai daqui.
 *
 * A leitura por IA é uma porta separada e explícita: ela MANDA O ARQUIVO
 * PARA FORA, então só aparece para contas liberadas, nunca dispara sozinha
 * e pede confirmação antes. Em qualquer caso o resultado só PREENCHE a
 * tela — quem confirma é sempre a pessoa.
 */
export function ImportarNota({
  onImportar,
  desabilitado,
  iaLiberada,
}: {
  onImportar: (
    nota: NotaConferencia,
    avisoDeSoma?: boolean,
    jaConfirmado?: boolean,
  ) => void;
  desabilitado: boolean;
  /** Decidido no servidor; a action confere de novo antes de chamar a IA. */
  iaLiberada: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startImport] = useTransition();
  const [pendenteIa, startIa] = useTransition();
  // Guarda o arquivo escolhido para poder reenviá-lo à IA sem pedir de novo.
  const [arquivoAtual, setArquivoAtual] = useState<File | null>(null);
  const [confirmarIa, setConfirmarIa] = useState(false);

  function enviar(arquivo: File) {
    setErro(null);
    setArquivoAtual(arquivo);
    startImport(async () => {
      const formData = new FormData();
      formData.set("arquivo", arquivo);
      const resultado = await importarNotaDeArquivo(formData);
      // Libera o campo para reenviar o MESMO arquivo depois de corrigir algo.
      if (inputRef.current) inputRef.current.value = "";

      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      onImportar(resultado.nota);
    });
  }

  function lerComIa() {
    const arquivo = arquivoAtual;
    if (!arquivo) return;
    setConfirmarIa(false);
    setErro(null);
    startIa(async () => {
      const formData = new FormData();
      formData.set("arquivo", arquivo);
      const resultado = await importarNotaComIa(formData);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      // A pessoa já confirmou a releitura no diálogo da IA: perguntar de
      // novo se pode substituir seria ruído.
      onImportar(resultado.nota, resultado.avisoDeSoma, true);
    });
  }

  /** A IA lê imagem e PDF; XML já é exato e não precisa dela. */
  const arquivoServeParaIa =
    arquivoAtual !== null &&
    ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      arquivoAtual.type,
    );

  return (
    <section
      aria-labelledby="nota-importar"
      className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-3 rounded-xl p-5 ring-1"
    >
      <h2
        id="nota-importar"
        className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold"
      >
        <FileUp aria-hidden="true" className="size-6" />
        Tem o arquivo da nota?
      </h2>
      <p id="nota-importar-hint" className="text-muted-foreground text-base">
        Envie o <strong className="text-foreground font-medium">PDF</strong> da
        nota ou o arquivo{" "}
        <strong className="text-foreground font-medium">XML</strong> e o Gaveta
        preenche os itens para você conferir. Também dá para enviar uma{" "}
        <strong className="text-foreground font-medium">foto</strong> da nota de
        papel — com menos precisão. Se preferir, pode digitar tudo à mão abaixo.
      </p>

      <Label htmlFor="nota-arquivo" className="sr-only">
        Arquivo da nota (PDF, XML ou foto)
      </Label>
      <input
        ref={inputRef}
        id="nota-arquivo"
        type="file"
        accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,application/pdf,text/xml,application/xml,image/jpeg,image/png,image/webp"
        disabled={desabilitado || pendente}
        onChange={(event) => {
          const arquivo = event.target.files?.[0];
          if (arquivo) enviar(arquivo);
        }}
        aria-describedby="nota-importar-hint"
        className="sr-only"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={desabilitado || pendente}
        aria-busy={pendente}
        className="minimal:max-sm:h-12 minimal:max-sm:text-base h-14 self-start px-6 text-lg font-medium"
      >
        {pendente ? (
          <>
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            Lendo a nota…
          </>
        ) : (
          <>
            <FileUp aria-hidden="true" className="size-5" />
            Escolher arquivo da nota
          </>
        )}
      </Button>

      {erro ? (
        <p role="alert" className="text-destructive text-base">
          {erro}
        </p>
      ) : null}

      <p className="text-muted-foreground text-sm">
        O arquivo é lido aqui mesmo, no Gaveta — não é enviado para nenhum outro
        serviço.
      </p>

      {/* ---------- Leitura por IA (G2d) ----------
          Porta separada de propósito: é a única via que manda o arquivo para
          fora, então nunca dispara sozinha e pede confirmação antes. */}
      {iaLiberada && arquivoServeParaIa ? (
        <div className="border-border flex flex-col gap-2 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Ficou incompleto? A leitura por IA costuma acertar também as
            quantidades e os valores — mas, para isso,{" "}
            <strong className="text-foreground">o arquivo sai do Gaveta</strong>
            .
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmarIa(true)}
            disabled={desabilitado || pendente || pendenteIa}
            aria-busy={pendenteIa}
            className="minimal:max-sm:h-12 minimal:max-sm:text-base h-14 self-start px-6 text-lg font-medium"
          >
            {pendenteIa ? (
              <>
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />A
                IA está lendo…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" className="size-5" />
                Ler com IA
              </>
            )}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmarIa}
        onClose={() => setConfirmarIa(false)}
        title="Enviar esta nota para a IA?"
        description={
          <>
            Diferente das outras leituras, esta{" "}
            <strong className="text-foreground">
              envia o arquivo para um serviço de fora
            </strong>{" "}
            (Google) para ser lido.
            <span className="mt-2 block">
              A nota tem dados do seu fornecedor e os seus preços de compra.
              Envie apenas se estiver de acordo com isso.
            </span>
            <span className="mt-2 block">
              O resultado continua sendo uma sugestão: você confere item a item
              antes de lançar.
            </span>
          </>
        }
        confirmLabel="Enviar e ler"
        cancelLabel="Não enviar"
        onConfirm={lerComIa}
      />
    </section>
  );
}
