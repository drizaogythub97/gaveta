"use client";

import { Download, Share2, X } from "lucide-react";
import { useRef, useState } from "react";

import { dadosComprovante } from "@/app/comprovante/actions";
import { Receipt } from "@/components/receipt/receipt";
import { Button } from "@/components/ui/button";
import type { ComprovanteCarregado } from "@/lib/receipt/data";

type ArquivoPronto = { file: File; titulo: string };

export type FormatoEmissao = "pdf" | "imagem";

/** Desktop = mouse/trackpad (mesma heurística do preview/auto-print). */
export function isDesktop(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

type EmConstrucao = ComprovanteCarregado & { titulo: string };

/**
 * Emissão direta de comprovantes no celular (padrão FiadoApp F5b): busca os
 * dados via server action, renderiza o papel FORA da tela, gera o arquivo
 * (PNG hi-def via html-to-image; PDF embutindo o PNG via jsPDF) e abre o
 * compartilhamento nativo do aparelho — sem abrir /comprovante/[saleId].
 * No desktop, `emitir` apenas abre a rota de preview em nova aba, como
 * sempre (auto-print).
 *
 * Se a janela de ativação do navegador expirar antes do share (geração
 * demorou), um mini-diálogo "Documento pronto" pede um toque novo.
 */
export function useEmissorComprovante({
  onErro,
}: {
  /** Recebe mensagens de erro amigáveis (ex.: setar o feedback do caixa). */
  onErro: (mensagem: string) => void;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [emConstrucao, setEmConstrucao] = useState<EmConstrucao | null>(null);
  const [pronto, setPronto] = useState<ArquivoPronto | null>(null);
  const [gerando, setGerando] = useState(false);
  const gerandoRef = useRef(false);

  async function compartilhar(file: File, titulo: string) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: titulo });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Ativação expirada (NotAllowedError) ou share indisponível no meio
        // do caminho: guarda o arquivo e pede um toque novo.
        setPronto({ file, titulo });
        return;
      }
    }
    baixar(file);
  }

  function baixar(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function emitir(saleId: string, formato: FormatoEmissao) {
    // Desktop: preview em nova aba (auto-print), fluxo de sempre. SEM
    // noopener: o Fechar do preview usa window.close(), que exige opener.
    if (isDesktop()) {
      window.open(`/comprovante/${saleId}`, "_blank");
      return;
    }
    if (gerandoRef.current) return;
    gerandoRef.current = true;
    setGerando(true);
    try {
      const res = await dadosComprovante(saleId);
      if (!res.ok) {
        onErro(res.error);
        return;
      }

      // Renderiza o papel fora da tela e espera fontes/logo assentarem.
      setEmConstrucao(res);
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await document.fonts.ready.catch(() => {});
      const node = paperRef.current;
      if (!node) throw new Error("papel não renderizou");
      await Promise.all(
        Array.from(node.querySelectorAll("img")).map((img) =>
          img.decode().catch(() => {}),
        ),
      );

      const { toBlob } = await import("html-to-image");
      const png = await toBlob(node, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      if (!png) throw new Error("toBlob devolveu null");

      let file: File;
      if (formato === "imagem") {
        file = new File([png], `${res.nomeArquivo}.png`, {
          type: "image/png",
        });
      } else {
        file = new File([await pngParaPdf(png)], `${res.nomeArquivo}.pdf`, {
          type: "application/pdf",
        });
      }

      await compartilhar(file, res.titulo);
    } catch {
      onErro("Não foi possível gerar o comprovante. Tente de novo.");
    } finally {
      setEmConstrucao(null);
      setGerando(false);
      gerandoRef.current = false;
    }
  }

  const node = (
    <>
      {emConstrucao ? (
        <div
          aria-hidden="true"
          // Fora da viewport, mas renderizado (display:none quebraria o
          // html-to-image). A largura vem do papel do próprio Receipt
          // (80/58 mm = retrato natural de cupom, igual ao impresso).
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            pointerEvents: "none",
            background: "#fff",
          }}
        >
          <div ref={paperRef} style={{ background: "#fff" }}>
            <Receipt
              data={emConstrucao.data}
              prefs={emConstrucao.prefs}
              brand={emConstrucao.brand}
            />
          </div>
        </div>
      ) : null}

      {pronto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Documento pronto"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-card text-card-foreground ring-foreground/10 flex w-full max-w-md flex-col gap-4 rounded-xl p-6 ring-1">
            <p className="text-lg font-semibold tracking-tight">
              Documento pronto!
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => {
                  const alvo = pronto;
                  setPronto(null);
                  if (alvo) void compartilhar(alvo.file, alvo.titulo);
                }}
                className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-13 justify-start gap-3 px-5 text-base font-medium"
              >
                <Share2 aria-hidden="true" className="size-5" />
                Compartilhar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (pronto) baixar(pronto.file);
                  setPronto(null);
                }}
                className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-13 justify-start gap-3 px-5 text-base font-medium"
              >
                <Download aria-hidden="true" className="size-5" />
                Baixar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPronto(null)}
                className="minimal:max-sm:h-10 minimal:max-sm:text-sm h-12 px-5 text-base"
              >
                <X aria-hidden="true" className="size-5" />
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return { emitir, gerando, node };
}

/** Embute o PNG numa página única de PDF com o mesmo tamanho da imagem. */
async function pngParaPdf(png: Blob): Promise<Blob> {
  const [{ jsPDF }, bitmap] = await Promise.all([
    import("jspdf"),
    createImageBitmap(png),
  ]);
  const { width, height } = bitmap;
  bitmap.close();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(png);
  });
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    hotfixes: ["px_scaling"],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  return pdf.output("blob");
}
