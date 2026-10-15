"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";
import { LabelChip } from "@/components/ui/basics";
import { shapeColors } from "@/lib/color";
import { PRIORITY_META, type Priority } from "@/lib/domain";
import { dueState, shortDay } from "@/lib/dates";

type Person = { name: string; color: string; initials: string };
type SharedCard = {
  id: string; number: number; title: string; description: string | null; priority: string | null; dueDate: string | null; done: boolean; coverColor: string | null; columnId: string;
  client: { name: string; color: string } | null; labels: { name: string; color: string }[]; people: Person[]; checklists: { title: string; items: { text: string; done: boolean }[] }[];
};
export type SharedData = { name: string; description: string | null; color: string; client: string | null; columns: { id: string; name: string; color: string | null; isDone: boolean }[]; cards: SharedCard[] };

function Initials({ p, size = 26 }: { p: Person; size?: number }) {
  const tone = shapeColors(p.color);
  return (
    <span title={p.name} className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-surface" style={{ width: size, height: size, background: tone.bg, color: tone.fg }}>
      {p.initials}
    </span>
  );
}

function Due({ c }: { c: SharedCard }) {
  if (!c.dueDate) return null;
  const st = dueState(c.dueDate, c.done);
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium", st === "late" ? "bg-danger text-white" : "bg-surface-2 text-fg-2")}>
      <CalendarDays className="size-3.5" /> {shortDay(c.dueDate)}
    </span>
  );
}

export function SharedBoard({ data }: { data: SharedData }) {
  const router = useRouter();
  const [open, setOpen] = useState<SharedCard | null>(null);
  // o cliente vê as mudanças da equipe sem recarregar a página
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const tone = shapeColors(data.color);
  const total = data.cards.length;
  const done = data.cards.filter((c) => c.done).length;

  return (
    <div className="min-h-dvh pb-10">
      <header className="flex flex-wrap items-center gap-4 px-4 pb-4 pt-5 lg:px-6">
        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold" style={{ background: tone.bg, color: tone.fg }}>
          {data.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{data.name}</h1>
          <p className="truncate text-sm text-fg-2">{[data.client, `${total - done} em aberto, ${done} concluídas`].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-xs font-medium text-fg-2">Só visualização</span>
        <Logo size={22} />
      </header>
      {data.description && <p className="max-w-3xl px-4 pb-4 text-sm text-fg-2 lg:px-6">{data.description}</p>}

      <div className="flex gap-4 overflow-x-auto px-4 pb-4 lg:px-6">
        {data.columns.map((col) => {
          const list = data.cards.filter((c) => c.columnId === col.id);
          return (
            <section key={col.id} className="glass flex w-[300px] shrink-0 flex-col gap-3 rounded-[24px] p-3" aria-label={col.name}>
              <div className="flex items-center gap-2 px-1 pt-1">
                <span className="size-2.5 rounded-full" style={{ background: col.isDone ? "var(--success)" : col.color ?? "var(--fg-3)" }} />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{col.name}</h2>
                <span className="text-xs font-medium text-fg-3">{list.length}</span>
              </div>
              {list.length === 0 && <p className="px-1 pb-2 text-xs text-fg-3">Nada aqui agora.</p>}
              {list.map((c) => {
                const items = c.checklists.flatMap((l) => l.items);
                const ok = items.filter((i) => i.done).length;
                return (
                  <button key={c.id} type="button" onClick={() => setOpen(c)} className="grid gap-2 rounded-2xl bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md">
                    {c.coverColor && <span className="h-1.5 rounded-full" style={{ background: c.coverColor }} />}
                    {c.labels.length > 0 && <div className="flex flex-wrap gap-1">{c.labels.map((l) => <LabelChip key={l.name} name={l.name} color={l.color} size="xs" />)}</div>}
                    <p className={cn("text-[14px] font-medium leading-snug", c.done && "text-fg-2")}>{c.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Due c={c} />
                      {c.priority && c.priority in PRIORITY_META && <LabelChip name={PRIORITY_META[c.priority as Priority].label} color={PRIORITY_META[c.priority as Priority].color} size="xs" />}
                      {items.length > 0 && (
                        <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium", ok === items.length ? "bg-success text-white" : "bg-surface-2 text-fg-2")}>
                          <Check className="size-3.5" /> {ok}/{items.length}
                        </span>
                      )}
                      {c.people.length > 0 && <span className="ml-auto flex -space-x-1.5">{c.people.slice(0, 3).map((p) => <Initials key={p.name} p={p} size={24} />)}</span>}
                    </div>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={open.title} className="glass-strong max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] p-6 shadow-lg sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-fg-3">#{open.number} · {data.columns.find((c) => c.id === open.columnId)?.name}</p>
                <h3 className="mt-1 text-lg font-semibold leading-snug">{open.title}</h3>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(null)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {open.client && <LabelChip name={open.client.name} color={open.client.color} />}
              {open.labels.map((l) => <LabelChip key={l.name} name={l.name} color={l.color} />)}
              <Due c={open} />
              {open.done && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-success px-2 text-xs font-medium text-white"><Check className="size-3.5" /> Concluída</span>}
            </div>
            {open.people.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {open.people.map((p) => (
                  <span key={p.name} className="inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-sm"><Initials p={p} size={24} />{p.name}</span>
                ))}
              </div>
            )}
            {open.description && <div className="rich mt-5" dangerouslySetInnerHTML={{ __html: open.description }} />}
            {open.checklists.map((l, i) => (
              <div key={i} className="mt-5 grid gap-2">
                <p className="text-sm font-semibold">{l.title}</p>
                {l.items.map((it, k) => (
                  <div key={k} className="flex items-center gap-2.5 text-sm">
                    <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full", it.done ? "bg-accent text-accent-ink" : "bg-surface-3")}>
                      {it.done && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className={cn(it.done && "text-fg-2 line-through")}>{it.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
