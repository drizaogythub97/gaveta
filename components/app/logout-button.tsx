"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function confirm() {
    setSubmitting(true);
    // Submete o POST via formulário criado em runtime para que a sessão
    // seja invalidada server-side em /auth/sign-out.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/sign-out";
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 px-5 text-base"
        onClick={() => setOpen(true)}
      >
        Sair
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Sair da Gaveta?"
        description="Você precisará entrar de novo com seu e-mail e senha para acessar o sistema."
        confirmLabel="Sair"
        confirmVariant="destructive"
        onConfirm={confirm}
        pending={submitting}
      />
    </>
  );
}
