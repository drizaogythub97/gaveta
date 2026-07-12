"use client";

import { FileText, Image as ImageIcon, Printer, ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  isDesktop,
  useEmissorComprovante,
  type FormatoEmissao,
} from "@/components/receipt/emissor-comprovante";
import { Button } from "@/components/ui/button";
import { useClientFlag } from "@/lib/hooks/use-client-flag";

/**
 * Botão de comprovante de uma venda já registrada (lista do Financeiro).
 * Desktop: abre o preview em nova aba (auto-print), como sempre — SEM
 * noopener, o Fechar do preview usa window.close(). Celular: pergunta o
 * formato (PDF/Imagem) e emite direto com o share nativo, sem aba.
 */
export function BotaoComprovanteVenda({ saleId }: { saleId: string }) {
  const [aberto, setAberto] = useState(false);
  const celular = useClientFlag(() => !isDesktop());
  const { emitir, node: emissorNode } = useEmissorComprovante({
    onErro: (mensagem) => toast.error(mensagem),
  });

  function onClick() {
    if (!celular) {
      window.open(`/comprovante/${saleId}`, "_blank");
      return;
    }
    setAberto(true);
  }

  function escolher(formato: FormatoEmissao) {
    setAberto(false);
    void emitir(saleId, formato);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base font-medium"
      >
        {celular ? (
          <ReceiptText aria-hidden="true" className="size-5" />
        ) : (
          <Printer aria-hidden="true" className="size-5" />
        )}
        {celular ? "Comprovante" : "Imprimir venda"}
      </Button>

      {aberto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprovante da venda"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card text-card-foreground ring-foreground/10 flex w-full max-w-md flex-col gap-4 rounded-xl p-6 ring-1"
          >
            <div className="flex flex-col gap-1">
              <p className="minimal:max-sm:text-lg text-xl font-semibold tracking-tight">
                Comprovante da venda
              </p>
              <p className="minimal:max-sm:text-sm text-muted-foreground text-base">
                Escolha o formato: o arquivo abre no compartilhamento do
                aparelho.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => escolher("pdf")}
                className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-13 justify-start gap-3 px-5 text-base font-medium"
              >
                <FileText aria-hidden="true" className="size-5" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => escolher("imagem")}
                className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-13 justify-start gap-3 px-5 text-base font-medium"
              >
                <ImageIcon aria-hidden="true" className="size-5" />
                Imagem (foto para enviar)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAberto(false)}
                className="minimal:max-sm:h-10 minimal:max-sm:text-sm h-12 px-5 text-base"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {emissorNode}
    </>
  );
}
