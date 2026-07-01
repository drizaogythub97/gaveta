"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// O BarcodeDetector ainda não faz parte das libs de tipos do TS. Declaramos o
// mínimo que usamos. Disponível no Chrome/Android (e no Chrome do TWA).
type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

/** Só há suporte com BarcodeDetector + acesso à câmera (getUserMedia). */
export function isBarcodeCameraSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.BarcodeDetector === "function" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

type Props = {
  onDetect: (code: string) => void;
  onClose: () => void;
};

/**
 * Overlay que abre a câmera traseira e lê um código de barras. Ao detectar,
 * chama onDetect com o valor e o pai fecha o overlay. Uso pensado para o
 * celular na frente de caixa; no desktop o fluxo do leitor USB continua igual.
 */
export function BarcodeScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    async function start() {
      if (!window.BarcodeDetector) {
        setError("Este aparelho não suporta leitura por câmera.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setError(
          "Não foi possível acessar a câmera. Verifique a permissão do navegador.",
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const detector = new window.BarcodeDetector({ formats: FORMATS });
      interval = setInterval(async () => {
        if (stopped || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            stopped = true;
            onDetect(value);
          }
        } catch {
          // Falha pontual de leitura de frame: ignora e tenta no próximo.
        }
      }, 300);
    }

    void start();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Leitura de código de barras pela câmera"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {error ? (
        <div className="bg-card flex max-w-md flex-col gap-4 rounded-2xl p-6 text-center">
          <p className="text-base">{error}</p>
          <Button
            type="button"
            onClick={onClose}
            className="h-14 px-8 text-lg"
          >
            Fechar
          </Button>
        </div>
      ) : (
        <>
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              className="h-auto w-full"
              playsInline
              muted
              aria-hidden="true"
            />
            {/* Guia visual de mira. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
            />
          </div>
          <p className="text-center text-base text-white">
            Aponte a câmera para o código de barras do produto.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-14 gap-2 bg-white px-8 text-lg"
          >
            <X aria-hidden="true" className="size-5" />
            Cancelar
          </Button>
        </>
      )}
    </div>
  );
}
