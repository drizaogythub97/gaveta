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
    <form action={action} onSubmit={handleSubmit} className="flex-1 sm:flex-initial">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="destructive"
        className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 w-full px-4 text-base sm:w-auto"
        aria-label={`Excluir ${productName}`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Excluir
      </Button>
    </form>
  );
}
