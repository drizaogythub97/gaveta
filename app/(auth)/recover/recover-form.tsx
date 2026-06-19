"use client";

import { useActionState } from "react";

import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { recover, type RecoverState } from "./actions";

const initialState: RecoverState = {};

export function RecoverForm() {
  const [state, formAction] = useActionState(recover, initialState);

  if (state.success) {
    return <SuccessAlert message={state.success} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <ErrorAlert message={state.error} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-base">
          E-mail da conta
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

      <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}
