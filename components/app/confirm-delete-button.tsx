"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  id: string;
  productName: string;
  action: (formData: FormData) => Promise<void>;
};

export function ConfirmDeleteButton({ id, productName, action }: Props) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      `Excluir "${productName}"? Esta ação não pode ser desfeita.`,
    );
    if (!ok) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="destructive"
        className="h-12 px-4 text-base"
        aria-label={`Excluir ${productName}`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Excluir
      </Button>
    </form>
  );
}
