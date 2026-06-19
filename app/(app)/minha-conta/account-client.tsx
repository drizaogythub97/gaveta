"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  changeEmail,
  changePassword,
  deleteAccount,
  updateName,
} from "./actions";

type Props = {
  initialFullName: string;
  email: string;
  createdAt: string | null;
  privacyAcceptedAt: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type Toast = { kind: "success" | "error"; message: string } | null;

export function AccountClient({
  initialFullName,
  email: initialEmail,
  createdAt,
  privacyAcceptedAt,
}: Props) {
  const [fullName, setFullName] = useState(initialFullName);
  const [email] = useState(initialEmail);
  const [toast, setToast] = useState<Toast>(null);

  // ===== Edição inline do nome =====
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialFullName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, startNameSaving] = useTransition();

  function startEditName() {
    setNameDraft(fullName);
    setNameError(null);
    setEditingName(true);
  }
  function cancelEditName() {
    setEditingName(false);
    setNameDraft(fullName);
    setNameError(null);
  }
  function saveName() {
    setNameError(null);
    startNameSaving(async () => {
      const result = await updateName(nameDraft);
      if (result.ok) {
        setFullName(nameDraft.trim());
        setEditingName(false);
        setToast({ kind: "success", message: "Nome atualizado." });
      } else {
        setNameError(result.error ?? "Não foi possível salvar.");
      }
    });
  }

  // ===== Modal de troca de e-mail =====
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailCurrentPwd, setEmailCurrentPwd] = useState("");
  const [emailNew, setEmailNew] = useState("");
  const [emailDialogError, setEmailDialogError] = useState<string | null>(null);
  const [emailSaving, startEmailSaving] = useTransition();

  function openEmailDialog() {
    setEmailCurrentPwd("");
    setEmailNew("");
    setEmailDialogError(null);
    setEmailOpen(true);
  }
  function closeEmailDialog() {
    if (emailSaving) return;
    setEmailOpen(false);
    setEmailCurrentPwd("");
    setEmailNew("");
    setEmailDialogError(null);
  }
  function submitEmail() {
    setEmailDialogError(null);
    startEmailSaving(async () => {
      const result = await changeEmail(emailCurrentPwd, emailNew);
      if (result.ok) {
        setEmailOpen(false);
        setEmailCurrentPwd("");
        setEmailNew("");
        setToast({
          kind: "success",
          message:
            "Enviamos um link para o novo e-mail. Confirme por lá para finalizar a troca.",
        });
      } else {
        setEmailDialogError(result.error ?? "Não foi possível salvar.");
      }
    });
  }

  // ===== Modal de troca de senha =====
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdDialogError, setPwdDialogError] = useState<string | null>(null);
  const [pwdSaving, startPwdSaving] = useTransition();

  function openPwdDialog() {
    setPwdCurrent("");
    setPwdNew("");
    setPwdConfirm("");
    setPwdDialogError(null);
    setPwdOpen(true);
  }
  function closePwdDialog() {
    if (pwdSaving) return;
    setPwdOpen(false);
    setPwdCurrent("");
    setPwdNew("");
    setPwdConfirm("");
    setPwdDialogError(null);
  }
  function submitPwd() {
    setPwdDialogError(null);
    if (pwdNew !== pwdConfirm) {
      setPwdDialogError("A confirmação não bate com a nova senha.");
      return;
    }
    startPwdSaving(async () => {
      const result = await changePassword(pwdCurrent, pwdNew);
      if (result.ok) {
        setPwdOpen(false);
        setPwdCurrent("");
        setPwdNew("");
        setPwdConfirm("");
        setToast({ kind: "success", message: "Senha atualizada." });
      } else {
        setPwdDialogError(result.error ?? "Não foi possível salvar.");
      }
    });
  }

  // ===== Exclusão =====
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function openDeleteDialog() {
    setDeletePwd("");
    setDeleteError(null);
    setDeleteOpen(true);
  }
  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeletePwd("");
    setDeleteError(null);
  }
  function submitDelete() {
    setDeleteError(null);
    startDeleting(async () => {
      const result = await deleteAccount(deletePwd);
      if (result && result.ok === false) {
        setDeleteError(result.error);
      }
      // Em caso de sucesso o servidor redireciona para "/".
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {toast?.kind === "success" ? (
        <SuccessAlert message={toast.message} />
      ) : null}
      {toast?.kind === "error" ? <ErrorAlert message={toast.message} /> : null}

      <section
        aria-labelledby="profile-heading"
        className="ring-foreground/10 bg-card flex flex-col gap-1 rounded-xl p-5 ring-1"
      >
        <header className="mb-2">
          <h2 id="profile-heading" className="text-xl font-semibold">
            Dados pessoais
          </h2>
          <p className="text-muted-foreground text-base">
            Para alterar o e-mail ou a senha pedimos a sua senha atual.
          </p>
        </header>

        {/* E-mail */}
        <Row
          label="E-mail"
          value={email}
          actionLabel="Alterar"
          onAction={openEmailDialog}
        />

        {/* Nome */}
        <div className="border-border border-t py-4">
          <p className="text-muted-foreground text-sm">Nome</p>
          {editingName ? (
            <div className="mt-2 flex flex-col gap-2">
              <Label htmlFor="name-draft" className="sr-only">
                Novo nome
              </Label>
              <Input
                id="name-draft"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                disabled={nameSaving}
                className="h-14 text-lg"
                minLength={2}
                maxLength={120}
              />
              {nameError ? (
                <p className="text-destructive text-sm" role="alert">
                  {nameError}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEditName}
                  disabled={nameSaving}
                  className="h-12 px-5 text-base"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={saveName}
                  disabled={nameSaving}
                  aria-busy={nameSaving}
                  className="h-12 px-5 text-base"
                >
                  {nameSaving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-foreground text-lg">
                {fullName || (
                  <span className="text-muted-foreground italic">
                    (sem nome cadastrado)
                  </span>
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={startEditName}
                className="h-12 px-5 text-base"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Alterar
              </Button>
            </div>
          )}
        </div>

        {/* Senha */}
        <Row
          label="Senha"
          value="••••••••"
          actionLabel="Alterar"
          onAction={openPwdDialog}
          isLast
        />

        {createdAt || privacyAcceptedAt ? (
          <div className="text-muted-foreground border-border space-y-1 border-t pt-4 text-sm">
            {createdAt ? (
              <p>
                Conta criada em{" "}
                <strong className="text-foreground font-medium">
                  {DATE_FMT.format(new Date(createdAt))}
                </strong>
                .
              </p>
            ) : null}
            {privacyAcceptedAt ? (
              <p>
                Política de privacidade aceita em{" "}
                <strong className="text-foreground font-medium">
                  {DATE_FMT.format(new Date(privacyAcceptedAt))}
                </strong>
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="danger-heading"
        className="ring-destructive/30 bg-destructive/5 flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <header>
          <h2
            id="danger-heading"
            className="text-destructive text-xl font-semibold"
          >
            Excluir conta
          </h2>
          <p className="text-foreground/80 text-base">
            Esta ação <strong>não pode ser desfeita</strong>. Todos os seus
            produtos, vendas, códigos de barras, taxas, logo e dados pessoais
            serão apagados imediatamente.
          </p>
        </header>
        <Button
          type="button"
          variant="destructive"
          onClick={openDeleteDialog}
          className="h-12 px-5 text-base sm:self-start"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Excluir minha conta
        </Button>
      </section>

      {/* ===== Dialogs ===== */}

      <ConfirmDialog
        open={emailOpen}
        onClose={closeEmailDialog}
        title="Alterar e-mail"
        description="Confirme sua senha atual e digite o novo e-mail. Enviaremos um link de confirmação para o novo endereço."
        confirmLabel="Salvar"
        onConfirm={submitEmail}
        pending={emailSaving}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-current-pwd" className="text-base">
              Senha atual
            </Label>
            <PasswordField
              id="email-current-pwd"
              name="currentPassword"
              autoComplete="current-password"
              value={emailCurrentPwd}
              onChange={(e) => setEmailCurrentPwd(e.target.value)}
              disabled={emailSaving}
              className="h-14 text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email-new" className="text-base">
              Novo e-mail
            </Label>
            <Input
              id="email-new"
              type="email"
              autoComplete="off"
              value={emailNew}
              onChange={(e) => setEmailNew(e.target.value)}
              disabled={emailSaving}
              className="h-14 text-lg"
              required
            />
          </div>
          {emailDialogError ? (
            <p className="text-destructive text-sm" role="alert">
              {emailDialogError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={pwdOpen}
        onClose={closePwdDialog}
        title="Alterar senha"
        description="Confirme sua senha atual e cadastre uma nova de pelo menos 8 caracteres."
        confirmLabel="Salvar"
        onConfirm={submitPwd}
        pending={pwdSaving}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-current" className="text-base">
              Senha atual
            </Label>
            <PasswordField
              id="pwd-current"
              name="currentPassword"
              autoComplete="current-password"
              value={pwdCurrent}
              onChange={(e) => setPwdCurrent(e.target.value)}
              disabled={pwdSaving}
              className="h-14 text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-new" className="text-base">
              Nova senha
            </Label>
            <PasswordField
              id="pwd-new"
              name="newPassword"
              autoComplete="new-password"
              value={pwdNew}
              onChange={(e) => setPwdNew(e.target.value)}
              minLength={8}
              disabled={pwdSaving}
              className="h-14 text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-confirm" className="text-base">
              Confirme a nova senha
            </Label>
            <PasswordField
              id="pwd-confirm"
              name="confirmPassword"
              autoComplete="new-password"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)}
              minLength={8}
              disabled={pwdSaving}
              className="h-14 text-lg"
            />
          </div>
          {pwdDialogError ? (
            <p className="text-destructive text-sm" role="alert">
              {pwdDialogError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={closeDeleteDialog}
        title="Excluir conta definitivamente?"
        description={
          <span>
            Confirme sua senha para apagar todos os seus dados. Essa ação{" "}
            <strong className="text-foreground">não pode ser desfeita</strong>.
          </span>
        }
        confirmLabel="Excluir conta"
        confirmVariant="destructive"
        onConfirm={submitDelete}
        pending={deleting}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-password" className="text-base">
            Sua senha
          </Label>
          <PasswordField
            id="delete-password"
            name="password"
            autoComplete="current-password"
            value={deletePwd}
            onChange={(e) => setDeletePwd(e.target.value)}
            disabled={deleting}
            className="h-14 text-lg"
          />
          {deleteError ? (
            <p className="text-destructive text-sm" role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Row({
  label,
  value,
  actionLabel,
  onAction,
  isLast,
}: {
  label: string;
  value: string;
  actionLabel: string;
  onAction: () => void;
  isLast?: boolean;
}) {
  return (
    <div
      className={
        isLast
          ? "border-border flex flex-wrap items-center justify-between gap-3 border-t py-4"
          : "border-border flex flex-wrap items-center justify-between gap-3 border-t py-4"
      }
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-foreground text-lg break-all">{value}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onAction}
        className="h-12 px-5 text-base"
      >
        <Pencil aria-hidden="true" className="size-4" />
        {actionLabel}
      </Button>
    </div>
  );
}
