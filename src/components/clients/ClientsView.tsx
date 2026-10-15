"use client";

import Link from "next/link";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArchiveRestore, Building2, Mail, Pencil, Phone, Plus, Search, UserRound } from "lucide-react";
import { PALETTE, initials } from "@/lib/domain";
import { shapeColors } from "@/lib/color";
import { Button, EmptyState, Field, Input, Textarea } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { PageHeader } from "@/components/PageHeader";
import { ColorGrid } from "@/components/board/pickers";
import { ImageUpload, uploadProfileImage } from "@/components/ui/ImageUpload";
import { createClient, deleteClient, setClientActive, updateClient } from "@/app/actions/clients";

export type ClientRow = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  color: string;
  imageUrl: string | null;
  active: boolean;
  open: number;
  late: number;
  done30: number;
  total: number;
};

/** Marca do cliente: foto/logo circular ou as iniciais na cor do cliente. */
export function ClientMark({ name, color, imageUrl, size = 44 }: { name: string; color: string; imageUrl?: string | null; size?: number }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="shrink-0 rounded-full bg-surface object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: shapeColors(color).bg, color: shapeColors(color).fg, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function ClientsView({ clients, isAdmin }: { clients: ClientRow[]; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);
  const active = clients.filter((c) => c.active && c.name.toLowerCase().includes(q.toLowerCase()));
  const archived = clients.filter((c) => !c.active);

  return (
    <div className="pb-10">
      <LiveRefresh />
      <PageHeader
        title="Clientes"
        subtitle={`${clients.filter((c) => c.active).length} ${clients.filter((c) => c.active).length === 1 ? "cliente ativo" : "clientes ativos"}`}
        actions={
          <>
            <div className="glass-strong flex h-11 w-full max-w-[240px] items-center gap-2 rounded-full px-3.5">
              <Search className="size-4 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3" />
            </div>
            <Button variant="dark" className="h-11" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Novo cliente
            </Button>
          </>
        }
      />
      <div className="px-4 lg:px-6">
        {clients.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="Cadastre o primeiro cliente"
            text="Ligue as demandas aos clientes para filtrar o quadro e ver tudo o que está em aberto para cada um."
            action={<Button variant="primary" onClick={() => setEditing("new")}>Novo cliente</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((c) => (
              <Link key={c.id} href={`/clientes/${c.id}`} className="glass group grid gap-4 rounded-[26px] p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <ClientMark name={c.name} color={c.color} imageUrl={c.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] font-semibold">{c.name}</h2>
                    <p className="truncate text-sm text-fg-2">{c.contact || c.email || "Sem contato cadastrado"}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Editar ${c.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setEditing(c);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-full text-fg-3 opacity-0 transition-opacity hover:bg-surface hover:text-fg group-hover:opacity-100 focus:opacity-100"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center rounded-full bg-surface/80 px-2.5 text-xs font-medium text-fg-2">{c.open} em aberto</span>
                  {c.late > 0 && (
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-danger px-2.5 text-xs font-semibold text-white">
                      <AlertCircle className="size-3.5" /> {c.late} {c.late === 1 ? "atrasada" : "atrasadas"}
                    </span>
                  )}
                  <span className="inline-flex h-7 items-center rounded-full bg-surface/80 px-2.5 text-xs font-medium text-fg-2">{c.done30} entregues em 30 dias</span>
                </div>
              </Link>
            ))}
            {active.length === 0 && <p className="text-sm text-fg-3">Nenhum cliente com esse nome.</p>}
          </div>
        )}

        {archived.length > 0 && (
          <section className="mt-10 grid gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-3">Arquivados</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((c) => (
                <ArchivedClient key={c.id} client={c} isAdmin={isAdmin} />
              ))}
            </div>
          </section>
        )}
      </div>
      {editing && <ClientForm client={editing === "new" ? null : editing} isAdmin={isAdmin} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ArchivedClient({ client, isAdmin }: { client: ClientRow; isAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <ClientMark name={client.name} color={client.color} imageUrl={client.imageUrl} size={32} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</span>
      {isAdmin && (
        <Button
          size="sm"
          onClick={async () => {
            const res = await setClientActive(client.id, true);
            if (!res.ok) return toast(res.error, "error");
            router.refresh();
          }}
        >
          <ArchiveRestore className="size-3.5" /> Restaurar
        </Button>
      )}
    </div>
  );
}

export function ClientForm({ client, isAdmin, onClose }: { client: ClientRow | null; isAdmin: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState({
    name: client?.name ?? "",
    contact: client?.contact ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    notes: client?.notes ?? "",
    color: client?.color ?? PALETTE[0],
  });
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(client?.imageUrl ?? null);
  const [pending, setPending] = useState<Blob | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = client ? await updateClient(client.id, form) : await createClient(form);
    if (res.ok && !client && pending) {
      // cadastro novo: a foto vai depois que o cliente existe
      await uploadProfileImage("cliente", (res.data as { id: string }).id, pending).catch(() => toast("Cliente salvo, mas a foto não foi enviada.", "error"));
    }
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast(client ? "Cliente salvo" : "Cliente cadastrado");
    onClose();
    router.refresh();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={client ? "Editar cliente" : "Novo cliente"}
      footer={
        <>
          {client && isAdmin && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              onClick={async () => {
                const hasCards = client.total > 0;
                const ok = await confirm({
                  title: hasCards ? `Arquivar ${client.name}?` : `Excluir ${client.name}?`,
                  text: hasCards ? "Ele tem demandas: sai das listas, mas continua ligado às demandas antigas." : "Não tem demandas ligadas e vai sumir de vez.",
                  confirm: hasCards ? "Arquivar" : "Excluir",
                  danger: true,
                });
                if (!ok) return;
                const res = hasCards ? await setClientActive(client.id, false) : await deleteClient(client.id);
                if (!res.ok) return toast(res.error, "error");
                onClose();
                router.refresh();
              }}
            >
              {client.total > 0 ? "Arquivar" : "Excluir"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={form.name.trim().length < 2}>{client ? "Salvar" : "Cadastrar"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <ImageUpload
          url={imageUrl}
          name={form.name || "?"}
          color={form.color}
          size={64}
          target="cliente"
          id={client?.id ?? null}
          onChange={(u) => {
            setImageUrl(u);
            router.refresh();
          }}
          onPick={(blob, preview) => {
            setPending(blob);
            setImageUrl(preview);
          }}
        />
        {!imageUrl && (
          <Field group label="Cor (sem foto)">
            <ColorGrid value={form.color} onChange={(c) => c && setForm((f) => ({ ...f, color: c }))} size={24} />
          </Field>
        )}
        <Field label="Nome do cliente">
          <Input autoFocus value={form.name} maxLength={80} onChange={set("name")} placeholder="Ex.: Aurora Cosméticos" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pessoa de contato">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
              <Input className="pl-9" value={form.contact} maxLength={80} onChange={set("contact")} />
            </div>
          </Field>
          <Field label="Telefone">
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
              <Input className="pl-9" value={form.phone} maxLength={30} inputMode="tel" onChange={set("phone")} />
            </div>
          </Field>
        </div>
        <Field label="E-mail">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <Input className="pl-9" type="email" value={form.email} maxLength={200} onChange={set("email")} />
          </div>
        </Field>
        <Field label="Observações">
          <Textarea rows={3} value={form.notes} maxLength={2000} onChange={set("notes")} placeholder="Tom de voz, horários, quem aprova..." />
        </Field>
      </div>
    </Modal>
  );
}

