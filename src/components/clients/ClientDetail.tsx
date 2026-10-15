"use client";

import Link from "next/link";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Inbox, Mail, Pencil, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { shortDay, todayKey } from "@/lib/dates";
import type { CardSummary } from "@/lib/types";
import { AvatarStack, Button, EmptyState } from "@/components/ui/basics";
import { DueChip } from "@/components/board/CardTile";
import { PriorityIcon } from "@/components/board/pickers";
import { CardModal } from "@/components/board/CardModal";
import { useLookups } from "@/components/board/lookups";
import { ClientForm, ClientMark, type ClientRow } from "./ClientsView";

type Row = CardSummary & { boardName: string; boardColor: string; columnName: string };

export function ClientDetail({ client, open: initialOpen, done, isAdmin }: { client: ClientRow; open: Row[]; done: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const { userById } = useLookups();
  const [editing, setEditing] = useState(false);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [prev, setPrev] = useState(initialOpen);
  if (prev !== initialOpen) {
    setPrev(initialOpen);
    setOpen(initialOpen);
  }
  const today = todayKey();
  const late = open.filter((c) => c.dueDate && c.dueDate < today).length;

  // agrupa por quadro
  const byBoard = new Map<string, Row[]>();
  for (const c of open) byBoard.set(c.boardId, [...(byBoard.get(c.boardId) ?? []), c]);

  const row = (c: Row, finished = false) => (
    <div
      key={c.id}
      role="button"
      tabIndex={0}
      onClick={() => setOpenCard(c.id)}
      onKeyDown={(e) => e.key === "Enter" && setOpenCard(c.id)}
      className="flex cursor-pointer items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      {finished ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <PriorityIcon priority={c.priority} size={20} />}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] font-medium", finished && "text-fg-2")}>{c.title}</p>
        <p className="truncate text-xs text-fg-3">
          {c.columnName}
          {finished && c.completedAt ? ` · entregue ${shortDay(c.completedAt.slice(0, 10))}` : ""}
        </p>
      </div>
      <AvatarStack users={c.assigneeIds.map((id) => userById.get(id)!).filter(Boolean)} size={22} />
      {!finished && c.dueDate && <DueChip due={c.dueDate} done={false} size="xs" />}
    </div>
  );

  return (
    <div className="px-4 pb-10 pt-5 lg:px-6">
      <LiveRefresh />
      <Link href="/clientes" className="mb-4 inline-flex h-9 items-center gap-2 rounded-full pr-3 text-sm font-medium text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="glass mb-5 flex flex-wrap items-start gap-4 rounded-[26px] p-5">
        <ClientMark name={client.name} color={client.color} imageUrl={client.imageUrl} size={60} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{client.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            {client.contact && <span className="inline-flex items-center gap-1.5"><UserRound className="size-4 text-fg-3" />{client.contact}</span>}
            {client.email && <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-fg"><Mail className="size-4 text-fg-3" />{client.email}</a>}
            {client.phone && <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-fg"><Phone className="size-4 text-fg-3" />{client.phone}</a>}
          </div>
          {client.notes && <p className="mt-3 max-w-2xl whitespace-pre-wrap rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg-2">{client.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-surface/80 px-3 text-xs font-medium text-fg-2">{open.length} em aberto</span>
          {late > 0 && <span className="inline-flex h-8 items-center rounded-full bg-danger px-3 text-xs font-semibold text-white">{late} {late === 1 ? "atrasada" : "atrasadas"}</span>}
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass grid content-start gap-5 rounded-[26px] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Em aberto</h2>
          {open.length === 0 && <EmptyState icon={<Inbox className="size-5" />} title="Nada em aberto" text="Quando uma demanda for ligada a este cliente, ela aparece aqui." />}
          {[...byBoard.entries()].map(([boardId, list]) => (
            <div key={boardId} className="grid gap-1.5">
              <Link href={`/quadros/${boardId}`} className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-fg">
                <span className="size-2 rounded-full" style={{ background: list[0].boardColor }} />
                {list[0].boardName} <span className="font-normal">{list.length}</span>
              </Link>
              {list.map((c) => row(c))}
            </div>
          ))}
        </section>
        <section className="glass grid content-start gap-2 rounded-[26px] p-4">
          <h2 className="px-1 pb-1 font-semibold">Entregues recentemente</h2>
          {done.length === 0 && <p className="px-1 text-sm text-fg-3">Nenhuma entrega ainda.</p>}
          {done.map((c) => row(c, true))}
        </section>
      </div>

      {editing && <ClientForm client={client} isAdmin={isAdmin} onClose={() => setEditing(false)} />}
      {openCard && (
        <CardModal
          key={openCard}
          cardId={openCard}
          onClose={() => {
            setOpenCard(null);
            router.refresh();
          }}
          onChange={(s) => setOpen((all) => all.map((x) => (x.id === s.id ? { ...x, ...s } : x)))}
          onRemoved={(id) => {
            setOpen((all) => all.filter((x) => x.id !== id));
            setOpenCard(null);
          }}
          onOpenOther={setOpenCard}
        />
      )}
    </div>
  );
}
