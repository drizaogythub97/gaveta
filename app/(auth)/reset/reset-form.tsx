"use client";

import { useActionState } from "react";

import { ErrorAlert } from "@/components/auth/form-feedback";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Label } from "@/components/ui/label";
import { PASSWORD_HINT } from "@/lib/validations/password";

import { reset, type ResetState } from "./actions";

const initialState: ResetState = {};

export function ResetForm() {
  const [state, formAction] = useActionState(reset, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <ErrorAlert message={state.error} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-base">
          Nova senha (mínimo 8 caracteres)
        </Label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password
              ? "password-error password-hint"
              : "password-hint"
          }
          className="h-14 text-lg"
        />
        <p id="password-hint" className="text-muted-foreground text-sm">
          {PASSWORD_HINT}
        </p>
        {state.fieldErrors?.password ? (
          <p
            id="password-error"
            className="text-destructive text-sm"
            role="alert"
          >
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirm" className="text-base">
          Repita a nova senha
        </Label>
        <PasswordField
          id="passwordConfirm"
          name="passwordConfirm"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.passwordConfirm)}
          aria-describedby={
            state.fieldErrors?.passwordConfirm
              ? "passwordConfirm-error"
              : undefined
          }
          className="h-14 text-lg"
        />
        {state.fieldErrors?.passwordConfirm ? (
          <p
            id="passwordConfirm-error"
            className="text-destructive text-sm"
            role="alert"
          >
            {state.fieldErrors.passwordConfirm}
          </p>
        ) : null}
      </div>

      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
