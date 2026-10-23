"use client";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui/basics";

export type DestinationCreator = (input: { name: string; email?: string }) => Promise<{ ok: true; data: { id: string; name: string; password?: string } } | { ok: false; error: string }>;
export function TrelloDestinationCreation({ kind, initialName = "", create, onCreated, associated = false }: { kind: "client" | "user"; initialName?: string; create: DestinationCreator; onCreated: (destination: { id: string; name: string }) => void; associated?: boolean }) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await create({ name, ...(kind === "user" ? { email } : {}) });
      if (!result.ok) { setError(result.error); return; }
      onCreated({ id: result.data.id, name: result.data.name });
      setPassword(result.data.password ?? ""); setCreated(true);
    } catch { setError("Não foi possível criar o cadastro. Confira a lista antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  if (associated && !created) return null;
  return <details className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
    <summary className="cursor-pointer font-medium">{kind === "client" ? "Criar cliente" : "Criar conta para esta pessoa"}</summary>
    <div className="mt-3 grid gap-3">
      <p className="text-xs text-fg-2">{kind === "client" ? "O cliente criado pode ser associado a vários quadros. Os quadros permanecem separados." : "A conta será de membro da equipe, com troca de senha no primeiro acesso. Informe um e-mail real."} O botão abaixo cria o cadastro agora, antes de importar os cards.</p>
      <Field label={kind === "client" ? "Nome do cliente a criar" : "Nome da pessoa a cadastrar"}><Input value={name} maxLength={80} disabled={busy || created} onChange={(event) => setName(event.target.value)} /></Field>
      {kind === "user" && <Field label="E-mail da nova conta"><Input type="email" value={email} disabled={busy || created} onChange={(event) => setEmail(event.target.value)} /></Field>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!created ? <Button type="button" disabled={busy || name.trim().length < 2 || (kind === "user" && !email.trim())} onClick={() => void submit()}>{busy ? "Criando…" : "Criar agora e associar"}</Button> : <p role="status">Cadastro criado e associado nesta prévia.</p>}
      {password && <div className="grid gap-2 rounded-xl bg-surface p-3"><p>Senha temporária de {email}: <code>{password}</code></p><p className="text-xs">Guarde o acesso antes de sair. A senha não será incluída no plano exportado.</p><Button type="button" onClick={() => setPassword("")}>Já guardei a senha</Button></div>}
    </div>
  </details>;
}
