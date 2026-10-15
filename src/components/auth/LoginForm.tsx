"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui/basics";
import { login } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} key={`e${state?.values?.email ?? ""}`} />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error && <p className="rounded-xl bg-danger px-3 py-2 text-sm font-medium text-white">{state.error}</p>}
      <Button type="submit" variant="dark" className="h-11" loading={pending}>Entrar</Button>
      <p className="text-center text-xs text-fg-3">Esqueceu a senha? Peça ao administrador da equipe uma nova.</p>
    </form>
  );
}
