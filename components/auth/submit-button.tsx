"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className,
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        // As classes minimal ficam depois do override do caller: no
        // Minimalista (mobile) o CTA acompanha a escala densa (h-11).
        "h-14 w-full px-6 text-lg font-medium",
        className,
        "minimal:max-sm:h-11 minimal:max-sm:text-base",
      )}
    >
      {pending ? (pendingText ?? "Enviando…") : children}
    </Button>
  );
}
