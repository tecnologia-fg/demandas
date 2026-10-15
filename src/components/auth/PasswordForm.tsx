"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui/basics";
import { changePassword } from "@/app/actions/auth";

export function PasswordForm({ submitLabel = "Trocar senha" }: { submitLabel?: string }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Senha atual">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nova senha" hint="Pelo menos 8 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Repita a nova senha">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state?.error && <p className="rounded-xl bg-danger px-3 py-2 text-sm font-medium text-white">{state.error}</p>}
      <div>
        <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
