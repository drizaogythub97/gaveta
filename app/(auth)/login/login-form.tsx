"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ErrorAlert } from "@/components/auth/form-feedback";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <ErrorAlert message={state.error} /> : null}

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
          defaultValue={state.email ?? ""}
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
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-base">
            Senha
          </Label>
          <Link
            href="/recover"
            className="text-primary text-base underline underline-offset-4 hover:no-underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
          className="h-14 text-lg"
        />
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

      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
