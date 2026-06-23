"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_HINT } from "@/lib/validations/password";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction] = useActionState(signup, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-5">
        <SuccessAlert message={state.success} />
        <Link
          href="/login"
          className="text-primary text-center text-base font-medium underline underline-offset-4 hover:no-underline"
        >
          Ir para a tela de entrada
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <ErrorAlert message={state.error} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName" className="text-base">
          Nome completo
        </Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          aria-describedby={
            state.fieldErrors?.fullName ? "fullName-error" : undefined
          }
          className="h-14 text-lg"
        />
        {state.fieldErrors?.fullName ? (
          <p
            id="fullName-error"
            className="text-destructive text-sm"
            role="alert"
          >
            {state.fieldErrors.fullName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-base">
          E-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : undefined
          }
          className="h-14 text-lg"
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-destructive text-sm" role="alert">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-base">
          Senha (mínimo 8 caracteres)
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
        <Label
          htmlFor="privacyAccepted"
          className="text-foreground items-start gap-3 text-base leading-snug font-normal"
        >
          <Checkbox
            id="privacyAccepted"
            name="privacyAccepted"
            value="on"
            required
            aria-invalid={Boolean(state.fieldErrors?.privacyAccepted)}
            aria-describedby={
              state.fieldErrors?.privacyAccepted ? "privacy-error" : undefined
            }
            className="mt-1 size-6"
          />
          <span>
            Li e aceito a{" "}
            <Link
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium underline underline-offset-4 hover:no-underline"
            >
              Política de Privacidade
            </Link>
            .
          </span>
        </Label>
        {state.fieldErrors?.privacyAccepted ? (
          <p
            id="privacy-error"
            className="text-destructive text-sm"
            role="alert"
          >
            {state.fieldErrors.privacyAccepted}
          </p>
        ) : null}
      </div>

      <SubmitButton pendingText="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}
