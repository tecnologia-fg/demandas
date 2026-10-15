"use client";

import { useActionState, useState } from "react";
import { cn } from "@/lib/cn";
import { Button, Field, Input } from "@/components/ui/basics";
import { firstAccess } from "@/app/actions/auth";
import { LoginForm } from "./LoginForm";

type Tab = "entrar" | "primeiro";

export function AuthTabs({ next, setupOpen, initialTab }: { next: string; setupOpen: boolean; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(setupOpen ? initialTab : "entrar");
  return (
    <div className="grid gap-6">
      {setupOpen && (
        <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Acesso">
          {([
            ["entrar", "Entrar"],
            ["primeiro", "Primeiro acesso"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={cn("h-10 rounded-full text-[14px] font-medium transition-colors", tab === v ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "entrar" ? (
        <div className="grid gap-1">
          <h1 className="text-[26px] font-semibold tracking-tight">Entrar</h1>
          <p className="mb-5 text-sm text-fg-2">As demandas da equipe, num quadro só.</p>
          <LoginForm next={next} />
        </div>
      ) : (
        <FirstAccessForm />
      )}
    </div>
  );
}

function FirstAccessForm() {
  const [state, action, pending] = useActionState(firstAccess, undefined);
  const [disableDemo, setDisableDemo] = useState(true);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-[26px] font-semibold tracking-tight">Primeiro acesso</h1>
        <p className="text-sm text-fg-2">Crie a sua conta. Ela vira a dona do Dmanda, e depois você convida a equipe.</p>
      </div>
      <Field label="Seu nome">
        <Input name="name" autoComplete="name" required minLength={2} maxLength={80} autoFocus defaultValue={state?.values?.name} key={`n${state?.values?.name ?? ""}`} />
      </Field>
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required maxLength={200} defaultValue={state?.values?.email} key={`e${state?.values?.email ?? ""}`} />
      </Field>
      <Field label="Senha" hint="Pelo menos 8 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} />
      </Field>
      <Field label="Repita a senha">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={200} />
      </Field>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
        <span>
          <span className="block font-medium">Desativar as contas de exemplo</span>
          <span className="text-xs text-fg-3">Os quadros de exemplo continuam, só os acessos de demonstração deixam de entrar.</span>
        </span>
        <input type="checkbox" name="disableDemo" className="sr-only" checked={disableDemo} onChange={(e) => setDisableDemo(e.target.checked)} />
        <span aria-hidden className={cn("h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors", disableDemo ? "bg-accent" : "bg-surface-3")}>
          <span className={cn("block size-4 rounded-full bg-white shadow transition-transform", disableDemo && "translate-x-4")} />
        </span>
      </label>
      {state?.error && <p className="rounded-xl bg-danger px-3 py-2 text-sm font-medium text-white">{state.error}</p>}
      <Button type="submit" variant="dark" className="h-11" loading={pending}>Criar minha conta</Button>
    </form>
  );
}
