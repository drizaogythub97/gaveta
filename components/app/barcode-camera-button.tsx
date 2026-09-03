"use client";

import { Camera } from "lucide-react";
import { useState } from "react";

import {
  BarcodeScanner,
  isBarcodeCameraSupported,
} from "@/components/app/barcode-scanner";
import { Button } from "@/components/ui/button";
import { useClientFlag } from "@/lib/hooks/use-client-flag";
import { cn } from "@/lib/utils";

/**
 * Botão "Escanear com a câmera" + o overlay de leitura, numa peça só.
 *
 * Existe porque três telas precisam exatamente do mesmo par (Frente de Caixa,
 * cadastro de Produtos e Estoque) e porque a regra de quando mostrar não é
 * óbvia: a leitura por câmera depende do `BarcodeDetector`, que só existe no
 * Chrome/Android (e no TWA). Onde não existe, o botão **não aparece** — e é
 * isso que fazia a opção "sumir" sem explicação.
 *
 * Por isso o `avisoSemSuporte`: em vez do vazio, a tela pode dizer em uma
 * linha por que o botão não está ali e qual é o outro caminho. Quem usa o
 * sistema não tem como adivinhar que o aparelho é o limite.
 */
export function BarcodeCameraButton({
  onDetect,
  rotulo = "Escanear com a câmera",
  variante = "texto",
  avisoSemSuporte,
  aoFechar,
  className,
}: {
  /** Recebe o código lido. O overlay se fecha sozinho antes de chamar. */
  onDetect: (code: string) => void;
  rotulo?: string;
  /** `icone` para grades apertadas (o rótulo vira `aria-label`). */
  variante?: "texto" | "icone";
  /** Linha mostrada quando o aparelho não tem leitura por câmera. */
  avisoSemSuporte?: string;
  /** Chamado ao fechar o overlay, tenha lido ou não (ex.: devolver o foco). */
  aoFechar?: () => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const suportado = useClientFlag(isBarcodeCameraSupported);

  if (!suportado) {
    return avisoSemSuporte ? (
      <p className="text-muted-foreground text-sm">{avisoSemSuporte}</p>
    ) : null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAberto(true)}
        aria-label={variante === "icone" ? rotulo : undefined}
        className={cn(
          variante === "icone"
            ? "h-12 w-12 shrink-0 p-0"
            : "h-12 gap-2 px-4 text-base",
          className,
        )}
      >
        <Camera aria-hidden="true" className="size-5" />
        {variante === "texto" ? rotulo : null}
      </Button>

      {aberto ? (
        <BarcodeScanner
          onDetect={(code) => {
            setAberto(false);
            onDetect(code);
            aoFechar?.();
          }}
          onClose={() => {
            setAberto(false);
            aoFechar?.();
          }}
        />
      ) : null}
    </>
  );
}
