"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

type Variant = "default" | "destructive";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: Variant;
  onConfirm: () => void;
  pending?: boolean;
  children?: React.ReactNode;
};

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmVariant = "default",
  onConfirm,
  pending = false,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Foca o botão de cancelar (default seguro para ações destrutivas).
    setTimeout(() => {
      const cancelBtn = panelRef.current?.querySelector<HTMLButtonElement>(
        "[data-dialog-cancel]",
      );
      cancelBtn?.focus();
    }, 0);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, pending]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-card text-card-foreground ring-foreground/10 flex w-full max-w-md flex-col gap-4 rounded-xl p-6 ring-1"
      >
        <div>
          <h2
            id="confirm-dialog-title"
            className="text-xl font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? (
            <div className="text-muted-foreground mt-2 text-base">
              {description}
            </div>
          ) : null}
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
            data-dialog-cancel
            className="h-12 px-5 text-base"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="h-12 px-5 text-base"
          >
            {pending ? "Aguarde…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
