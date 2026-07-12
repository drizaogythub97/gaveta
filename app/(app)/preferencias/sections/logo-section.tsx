"use client";

import { Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { Button } from "@/components/ui/button";

import { removeBrandLogo, uploadBrandLogo } from "../actions";

const MAX_INPUT_BYTES = 4_000_000; // 4 MB pré-crop
const TARGET_SIZE = 256; // px do crop final (square)
const ACCEPTED = "image/png,image/jpeg,image/webp";

type Props = {
  initialLogoUrl: string | null;
};

export function LogoSection({ initialLogoUrl }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialLogoUrl);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "error" | "success"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const imgRef = useRef<HTMLImageElement>(null);

  function onLoadImage(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const next = centerCrop(
      makeAspectCrop({ unit: "%", width: 80 }, 1, width, height),
      width,
      height,
    );
    setCrop(next);
  }

  function pickFile(file: File) {
    setFeedback(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFeedback({
        kind: "error",
        message: "Use uma imagem PNG, JPEG ou WebP.",
      });
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setFeedback({
        kind: "error",
        message: "A imagem precisa ter menos de 4 MB antes do recorte.",
      });
      return;
    }
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(file));
    setCompletedCrop(null);
  }

  async function buildCroppedBlob(): Promise<Blob | null> {
    const image = imgRef.current;
    if (!image || !completedCrop) return null;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      TARGET_SIZE,
      TARGET_SIZE,
    );

    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", 0.9);
    });
  }

  async function handleSave() {
    setFeedback(null);
    const blob = await buildCroppedBlob();
    if (!blob) {
      setFeedback({
        kind: "error",
        message: "Selecione uma imagem e ajuste o recorte primeiro.",
      });
      return;
    }
    const fd = new FormData();
    fd.set("logo", new File([blob], "logo.webp", { type: "image/webp" }));

    startTransition(async () => {
      const result = await uploadBrandLogo(fd);
      if (result.ok) {
        // Reset crop state e atualiza preview com o blob recém-enviado.
        if (originalUrl) URL.revokeObjectURL(originalUrl);
        setOriginalUrl(null);
        setCompletedCrop(null);
        setPreviewUrl(URL.createObjectURL(blob));
        setFeedback({ kind: "success", message: "Logo atualizada." });
      } else {
        setFeedback({
          kind: "error",
          message: result.error ?? "Não foi possível enviar.",
        });
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeBrandLogo();
      if (result.ok) {
        setPreviewUrl(null);
        if (originalUrl) URL.revokeObjectURL(originalUrl);
        setOriginalUrl(null);
        setFeedback({ kind: "success", message: "Logo removida." });
      } else {
        setFeedback({
          kind: "error",
          message: result.error ?? "Não foi possível remover.",
        });
      }
    });
  }

  return (
    <section
      aria-labelledby="logo-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 minimal:max-sm:p-4 rounded-xl p-5 ring-1"
    >
      <header>
        <h2 id="logo-heading" className="minimal:max-sm:text-lg text-xl font-semibold">
          Logo do estabelecimento
        </h2>
        <p className="text-muted-foreground text-base">
          A imagem aparece ao lado do nome, no cabeçalho. Sem uma logo
          personalizada, usamos a marca padrão &ldquo;Gaveta&rdquo;. PNG, JPEG
          ou WebP até 4 MB. Será recortada em quadrado.
        </p>
      </header>

      {feedback?.kind === "error" ? <ErrorAlert message={feedback.message} /> : null}
      {feedback?.kind === "success" ? <SuccessAlert message={feedback.message} /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <div className="border-border bg-muted flex size-32 items-center justify-center overflow-hidden rounded-xl border">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Logo atual"
                className="size-full object-cover"
              />
            ) : (
              <>
                <Image
                  src="/logo-mark.png"
                  alt="Marca padrão Gaveta"
                  width={80}
                  height={80}
                  className="size-20 object-contain dark:hidden"
                />
                <Image
                  src="/logo-mono-white.png"
                  alt="Marca padrão Gaveta"
                  width={80}
                  height={80}
                  className="hidden size-20 object-contain dark:block"
                />
              </>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {previewUrl ? "Pré-visualização" : "Padrão: Gaveta"}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <label className="border-border hover:bg-muted flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-base font-medium transition-colors">
            <Upload aria-hidden="true" className="size-5" />
            Escolher imagem
            <input
              type="file"
              accept={ACCEPTED}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
          {previewUrl && !originalUrl ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={pending}
              className="h-12 text-base"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Remover logo atual
            </Button>
          ) : null}
        </div>
      </div>

      {originalUrl ? (
        <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-base font-medium">
            Ajuste o recorte (formato quadrado, 256 × 256):
          </p>
          <div className="overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              keepSelection
              minWidth={32}
              minHeight={32}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={originalUrl}
                alt=""
                onLoad={onLoadImage}
                className="max-h-96 max-w-full"
              />
            </ReactCrop>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (originalUrl) URL.revokeObjectURL(originalUrl);
                setOriginalUrl(null);
                setCompletedCrop(null);
              }}
              disabled={pending}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={pending || !completedCrop}
              aria-busy={pending}
              className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
            >
              {pending ? "Enviando…" : "Salvar logo"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
