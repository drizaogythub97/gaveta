"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { NotaConferencia } from "@/lib/compras/tipos";

import { importarNotaDeArquivo } from "./import-actions";

/**
 * Importar a nota de um arquivo (fase G2b): PDF do DANFE com camada de
 * texto, ou XML da NF-e. O arquivo é lido no próprio servidor do Gaveta —
 * não vai para nenhum serviço de fora e não custa nada.
 *
 * O resultado apenas PREENCHE a tela; quem confirma é sempre a pessoa.
 */
export function ImportarNota({
  onImportar,
  desabilitado,
}: {
  onImportar: (nota: NotaConferencia) => void;
  desabilitado: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startImport] = useTransition();

  function enviar(arquivo: File) {
    setErro(null);
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
    </section>
  );
}
