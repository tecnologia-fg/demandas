"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, LayoutTemplate, Palette, Pencil, Plus, ShieldCheck, Tag, Trash2, Users, ScrollText } from "lucide-react";
import { BrandManual } from "./BrandManual";
import { TemplatesTab } from "./TemplatesTab";
import { cn } from "@/lib/cn";
import { PALETTE, initials } from "@/lib/domain";
import { relativeTime } from "@/lib/dates";
import { Avatar, Button, Field, Input, LabelChip } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { PageHeader } from "@/components/PageHeader";
import { ColorGrid } from "@/components/board/pickers";
import { createLabel, createUser, deleteLabel, resetUserPassword, updateLabel, updateUser } from "@/app/actions/team";

type U = { id: string; name: string; email: string; role: string; color: string; avatarUrl: string | null; active: boolean; lastLoginAt: string | null; mustChangePassword: boolean };
type L = { id: string; name: string; color: string; uses: number };
type Log = { id: string; action: string; detail: string | null; actor: string; createdAt: string };

const ACTION_LABEL: Record<string, string> = {
  "trello.labels.review": "Revisou etiquetas importadas",
  "trello.labels.undo": "Desfez revisão de etiquetas",
  "user.create": "Cadastrou pessoa",
  "user.update": "Alterou pessoa",
  "user.reset_password": "Gerou nova senha",
  "board.archive": "Arquivou quadro",
  "board.restore": "Restaurou quadro",
  "board.delete": "Excluiu quadro",
  "label.delete": "Excluiu etiqueta",
  "login.fail": "Login errado",
  "password.change": "Trocou a senha",
  "setup.complete": "Fez o primeiro acesso",
  "client.archive": "Arquivou cliente",
  "client.restore": "Restaurou cliente",
  "client.delete": "Excluiu cliente",
};

type Tab = "equipe" | "etiquetas" | "modelos" | "marca" | "registro";

export function SettingsView({ meId, isAdmin, users, labels, logs, initialTab }: { meId: string; isAdmin: boolean; users: U[]; labels: L[]; logs: Log[]; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab === "marca" || initialTab === "etiquetas" || initialTab === "modelos" || (initialTab === "registro" && isAdmin) ? initialTab : "equipe");
  const tabs = [
    ["equipe", "Equipe", Users],
    ["etiquetas", "Etiquetas", Tag],
    ["modelos", "Modelos", LayoutTemplate],
    ["marca", "Marca", Palette],
    ...(isAdmin ? [["registro", "Registro", ScrollText]] : []),
  ] as [typeof tab, string, typeof Users][];
  return (
    <div className="pb-10">
      <PageHeader
        title={tab === "marca" ? "Manual da marca" : "Configurações"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? <Link href="/configuracoes/importar-trello" className="rounded-full bg-panel px-4 py-2.5 text-sm font-medium text-panel-fg">Importar Trello</Link> : null}
          <div className="glass-strong flex h-11 items-center rounded-full p-1">
            {tabs.map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => { setTab(v); window.history.replaceState(null, "", v === "equipe" ? "/configuracoes" : `/configuracoes?aba=${v}`); }} className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 sm:px-4 text-[13.5px] font-medium", tab === v ? "bg-surface text-fg shadow-sm" : "text-fg-2")}>
                <Icon className="size-4" /> <span className="max-sm:sr-only">{label}</span>
              </button>
            ))}
          </div>
          </div>
        }
      />
      <div className="px-4 lg:px-6">
        {tab === "equipe" && <Team users={users} isAdmin={isAdmin} meId={meId} />}
        {tab === "etiquetas" && <LabelsTab labels={labels} isAdmin={isAdmin} />}
        {tab === "modelos" && <TemplatesTab labels={labels} />}
        {tab === "marca" && <BrandManual />}
        {tab === "registro" && <LogTab logs={logs} />}
      </div>
    </div>
  );
}

function Team({ users, isAdmin, meId }: { users: U[]; isAdmin: boolean; meId: string }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<U | "new" | null>(null);
  const [password, setPassword] = useState<{ name: string; email: string; password: string } | null>(null);

  return (
    <section className="glass grid gap-2 rounded-[26px] p-4 sm:p-5">
      <div className="flex items-center gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Equipe</h2>
          <p className="text-sm text-fg-2">{users.filter((u) => u.active).length} pessoas ativas</p>
        </div>
        {isAdmin && (
          <Button variant="dark" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Adicionar pessoa
          </Button>
        )}
      </div>
      {users.map((u) => (
        <div key={u.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm", !u.active && "opacity-55")}>
          <Avatar user={{ name: u.name, color: u.color, initials: initials(u.name), avatarUrl: u.avatarUrl }} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">
              {u.name} {u.id === meId && <span className="text-fg-3">(você)</span>}
            </p>
            <p className="truncate text-xs text-fg-3">
              {u.email} · {u.active ? (u.lastLoginAt ? `último acesso ${relativeTime(u.lastLoginAt)}` : "nunca entrou") : "desativada"}
            </p>
          </div>
          {u.role === "ADMIN" ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-panel px-2.5 text-xs font-semibold text-panel-fg"><ShieldCheck className="size-3.5" /> Admin</span>
          ) : (
            <span className="inline-flex h-7 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2">Equipe</span>
          )}
          {isAdmin && (
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Editar ${u.name}`} onClick={() => setEditing(u)} className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"><Pencil className="size-4" /></button>
              <button
                type="button"
                aria-label={`Gerar nova senha para ${u.name}`}
                title="Gerar nova senha"
                onClick={async () => {
                  if (!(await confirm({ title: `Gerar nova senha para ${u.name}?`, text: "A senha atual deixa de funcionar e a pessoa troca no primeiro acesso.", confirm: "Gerar senha" }))) return;
                  const res = await resetUserPassword(u.id);
                  if (!res.ok) return toast(res.error, "error");
                  setPassword({ name: u.name, email: u.email, password: res.data });
                }}
                className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"
              >
                <KeyRound className="size-4" />
              </button>
            </div>
          )}
        </div>
      ))}

      {editing && (
        <UserForm
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === meId}
          onClose={() => setEditing(null)}
          onCreated={(p) => {
            setEditing(null);
            setPassword(p);
            router.refresh();
          }}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      <Modal open={Boolean(password)} onClose={() => setPassword(null)} title="Acesso criado" size="sm" footer={<Button variant="primary" onClick={() => setPassword(null)}>Pronto</Button>}>
        {password && (
          <div className="grid gap-3 text-sm">
            <p className="text-fg-2">Envie para {password.name}. A senha só aparece agora e a pessoa troca no primeiro acesso.</p>
            <div className="grid gap-1 rounded-2xl bg-surface-2 p-3 font-mono text-[13px]">
              <span>E-mail: {password.email}</span>
              <span>Senha: {password.password}</span>
            </div>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(`Acesso ao Dmanda\nEndereço: ${window.location.origin}/login\nE-mail: ${password.email}\nSenha temporária: ${password.password}`).catch(() => {});
                toast("Copiado");
              }}
            >
              <Copy className="size-4" /> Copiar mensagem
            </Button>
          </div>
        )}
      </Modal>
    </section>
  );
}

function UserForm({ user, isSelf, onClose, onCreated, onSaved }: { user: U | null; isSelf: boolean; onClose: () => void; onCreated: (p: { name: string; email: string; password: string }) => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">((user?.role as "ADMIN" | "MEMBER") ?? "MEMBER");
  const [color, setColor] = useState(user?.color ?? PALETTE[7]);
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    if (!user) {
      const res = await createUser({ name, email, role, color });
      setSaving(false);
      if (!res.ok) return toast(res.error, "error");
      onCreated({ name, email: email.trim().toLowerCase(), password: res.data.password });
    } else {
      const res = await updateUser(user.id, { name, email, role, color, active });
      setSaving(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Salvo");
      onSaved();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? "Editar pessoa" : "Adicionar pessoa"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!name.trim() || !email.trim()}>{user ? "Salvar" : "Criar acesso"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar user={{ name: name || "?", color, initials: initials(name || "?") }} size={52} />
          <ColorGrid value={color} onChange={(c) => c && setColor(c)} size={24} />
        </div>
        <Field label="Nome">
          <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field group label="Permissão">
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["MEMBER", "Equipe", "Cria e move demandas, comenta, cria quadros e etiquetas."],
              ["ADMIN", "Administrador", "Tudo da equipe, mais gerenciar pessoas e arquivar quadros."],
            ] as const).map(([v, label, text]) => (
              <button key={v} type="button" disabled={isSelf} onClick={() => setRole(v)} className={cn("grid gap-0.5 rounded-2xl p-3 text-left disabled:opacity-60", role === v ? "bg-panel text-panel-fg" : "bg-surface-2")}>
                <span className="text-sm font-semibold">{label}</span>
                <span className={cn("text-xs", role === v ? "text-panel-fg-2" : "text-fg-3")}>{text}</span>
              </button>
            ))}
          </div>
        </Field>
        {user && !isSelf && (
          <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-surface-2 px-3 py-3 text-sm">
            <span>
              <span className="block font-medium">Acesso ativo</span>
              <span className="text-xs text-fg-3">Desativar tira o acesso na hora, sem apagar o histórico.</span>
            </span>
            <input type="checkbox" className="sr-only" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className={cn("h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors", active ? "bg-success" : "bg-surface-3")}>
              <span className={cn("block size-4 rounded-full bg-white shadow transition-transform", active && "translate-x-4")} />
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function LabelsTab({ labels: initial, isAdmin }: { labels: L[]; isAdmin: boolean }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<L | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[6]);

  const open = (l: L | "new") => {
    setEditing(l);
    setName(l === "new" ? "" : l.name);
    setColor(l === "new" ? PALETTE[6] : l.color);
  };

  return (
    <section className="glass grid gap-2 rounded-[26px] p-4 sm:p-5">
      <div className="flex items-center gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Etiquetas</h2>
          <p className="text-sm text-fg-2">Valem para todos os quadros. Use para cliente, tipo de peça ou área.</p>
        </div>
        <Button variant="dark" onClick={() => open("new")}>
          <Plus className="size-4" /> Nova etiqueta
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {initial.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm">
            <span className="min-w-0 flex-1"><LabelChip name={l.name} color={l.color} /></span>
            <span className="text-xs text-fg-3">{l.uses} {l.uses === 1 ? "uso" : "usos"}</span>
            <button type="button" aria-label={`Editar ${l.name}`} onClick={() => open(l)} className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"><Pencil className="size-3.5" /></button>
            {isAdmin && (
              <button
                type="button"
                aria-label={`Excluir ${l.name}`}
                onClick={async () => {
                  if (!(await confirm({ title: `Excluir "${l.name}"?`, text: l.uses ? `Ela sai de ${l.uses} demandas.` : undefined, confirm: "Excluir", danger: true }))) return;
                  const res = await deleteLabel(l.id);
                  if (!res.ok) return toast(res.error, "error");
                  router.refresh();
                }}
                className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nova etiqueta" : "Editar etiqueta"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={async () => {
                const res = editing === "new" ? await createLabel({ name, color }) : await updateLabel((editing as L).id, { name, color });
                if (!res.ok) return toast(res.error, "error");
                setEditing(null);
                router.refresh();
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Nome">
            <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ColorGrid value={color} onChange={(c) => c && setColor(c)} size={28} />
          {name.trim() && <div><LabelChip name={name} color={color} /></div>}
        </div>
      </Modal>
    </section>
  );
}

function LogTab({ logs }: { logs: Log[] }) {
  return (
    <section className="glass grid gap-1 rounded-[26px] p-4 sm:p-5">
      <h2 className="pb-2 text-lg font-semibold">Registro de ações</h2>
      {logs.length === 0 && <p className="text-sm text-fg-3">Nada registrado ainda.</p>}
      {logs.map((l) => (
        <div key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl px-2 py-2 text-sm hover:bg-surface/60">
          <span className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{l.detail}</span>
          <span className="text-xs text-fg-3">{l.actor} · {relativeTime(l.createdAt)}</span>
        </div>
      ))}
    </section>
  );
}
