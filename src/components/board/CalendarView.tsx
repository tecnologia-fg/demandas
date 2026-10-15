"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { MONTHS_FULL, WEEKDAYS, dueState, todayKey } from "@/lib/dates";
import type { CardSummary } from "@/lib/types";
import { Avatar } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { updateCard } from "@/app/actions/cards";
import { useLookups } from "./lookups";

function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
  });
}

export function CalendarView({
  cards,
  onOpen,
  onChange,
  boardColors,
}: {
  cards: CardSummary[];
  onOpen: (id: string) => void;
  onChange: (c: CardSummary) => void;
  boardColors?: Record<string, string>;
}) {
  const { toast } = useFeedback();
  const today = todayKey();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const c of cards) {
      if (!c.dueDate) continue;
      const list = map.get(c.dueDate) ?? [];
      list.push(c);
      map.set(c.dueDate, list);
    }
    return map;
  }, [cards]);
  const unscheduled = cards.filter((c) => !c.dueDate && !c.completedAt);
  const rows = days.slice(35).every((d) => !d.inMonth) ? days.slice(0, 35) : days;

  const move = (delta: number) => setCursor((c) => {
    const m = c.m + delta;
    return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  const drop = async (key: string | null, id: string) => {
    setDragOver(null);
    const card = cards.find((c) => c.id === id);
    if (!card || card.dueDate === key) return;
    onChange({ ...card, dueDate: key });
    const res = await updateCard(id, { dueDate: key });
    if (res.ok) onChange(res.data);
    else {
      onChange(card);
      toast(res.error, "error");
    }
  };

  const chip = (c: CardSummary) => {
    const state = dueState(c.dueDate, Boolean(c.completedAt), today);
    const color = boardColors?.[c.boardId];
    return (
      <button
        key={c.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/card", c.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onOpen(c.id)}
        title={c.title}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] font-medium shadow-sm transition-shadow hover:shadow-md max-sm:min-h-10 max-sm:rounded-xl max-sm:px-3 max-sm:text-[13.5px]",
          state === "late" ? "bg-danger text-white" : state === "done" ? "bg-surface-2 text-fg-3 line-through" : "bg-card text-fg",
        )}
      >
        {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
      </button>
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
      {/* Celular: lista por dia (a grade do mês não cabe) */}
      <div className="glass grid gap-3 rounded-[26px] p-3 sm:hidden">
        <div className="flex items-center gap-1 px-1">
          <h2 className="text-lg font-semibold">{MONTHS_FULL[cursor.m]} <span className="font-normal text-fg-3">{cursor.y}</span></h2>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="h-9 rounded-full bg-surface/80 px-3 text-[13px] font-medium">Hoje</button>
            <button type="button" aria-label="Mês anterior" onClick={() => move(-1)} className="inline-flex size-10 items-center justify-center rounded-full bg-surface/60"><ChevronLeft className="size-4" /></button>
            <button type="button" aria-label="Próximo mês" onClick={() => move(1)} className="inline-flex size-10 items-center justify-center rounded-full bg-surface/60"><ChevronRight className="size-4" /></button>
          </div>
        </div>
        {days.filter((d) => d.inMonth && (byDay.get(d.key)?.length ?? 0) > 0).length === 0 && (
          <p className="px-1 py-4 text-center text-sm text-fg-3">Nenhum prazo neste mês.</p>
        )}
        {days
          .filter((d) => d.inMonth && (byDay.get(d.key)?.length ?? 0) > 0)
          .map((d) => {
            const wd = WEEKDAYS[new Date(`${d.key}T12:00:00Z`).getUTCDay()];
            const isToday = d.key === today;
            return (
              <div key={d.key} className="grid grid-cols-[52px_1fr] gap-2">
                <div className={cn("flex h-14 flex-col items-center justify-center rounded-2xl", isToday ? "bg-accent text-accent-ink" : d.key < today ? "bg-surface/50 text-fg-3" : "bg-surface/80")}>
                  <span className="text-[11px] font-medium uppercase">{wd}</span>
                  <span className="text-lg font-semibold leading-none">{d.day}</span>
                </div>
                <div className="grid content-start gap-1.5">{(byDay.get(d.key) ?? []).map(chip)}</div>
              </div>
            );
          })}
      </div>

      <div className="glass hidden overflow-hidden rounded-[26px] sm:block">
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 className="text-lg font-semibold">{MONTHS_FULL[cursor.m]} <span className="font-normal text-fg-3">{cursor.y}</span></h2>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="h-9 rounded-full bg-surface/80 px-3.5 text-[13px] font-medium hover:bg-surface">Hoje</button>
            <button type="button" aria-label="Mês anterior" onClick={() => move(-1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface"><ChevronLeft className="size-4" /></button>
            <button type="button" aria-label="Próximo mês" onClick={() => move(1)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface"><ChevronRight className="size-4" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 px-2 pb-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="px-2 text-xs font-semibold uppercase tracking-wide text-fg-3">{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 px-2 pb-2">
              {rows.map((d) => {
                const list = byDay.get(d.key) ?? [];
                const isToday = d.key === today;
                return (
                  <div
                    key={d.key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(d.key);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((k) => (k === d.key ? null : k));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/card");
                      if (id) void drop(d.key, id);
                    }}
                    className={cn(
                      "flex min-h-[112px] flex-col gap-1 rounded-2xl p-1.5 transition-colors",
                      d.inMonth ? "bg-surface/55" : "bg-surface/20",
                      dragOver === d.key && "bg-surface ring-2 ring-accent",
                    )}
                  >
                    <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-[13px] font-medium", isToday ? "bg-accent text-accent-ink" : d.inMonth ? "text-fg" : "text-fg-3")}>{d.day}</span>
                    {list.slice(0, 4).map(chip)}
                    {list.length > 4 && <span className="px-1 text-[11px] font-medium text-fg-3">+{list.length - 4} demandas</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <aside
        className={cn("glass grid content-start gap-2 rounded-[26px] p-3 transition", dragOver === "none" && "ring-2 ring-accent")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("none");
        }}
        onDragLeave={() => setDragOver((k) => (k === "none" ? null : k))}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/card");
          if (id) void drop(null, id);
        }}
      >
        <p className="px-1 font-semibold">Sem prazo <span className="font-normal text-fg-3">{unscheduled.length}</span></p>
        <p className="px-1 text-xs text-fg-3">Arraste para um dia para dar prazo. No celular, toque na demanda e escolha o prazo.</p>
        <div className="grid max-h-[60vh] gap-1.5 overflow-y-auto scroll-thin">
          {unscheduled.map((c) => (
            <UnscheduledItem key={c.id} card={c} onOpen={onOpen} color={boardColors?.[c.boardId]} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function UnscheduledItem({ card, onOpen, color }: { card: CardSummary; onOpen: (id: string) => void; color?: string }) {
  const { userById } = useLookups();
  const first = card.assigneeIds.map((id) => userById.get(id)).find(Boolean);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/card", card.id)}
      onClick={() => onOpen(card.id)}
      className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 text-left text-[13px] font-medium shadow-sm hover:shadow-md"
    >
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="min-w-0 flex-1 truncate">{card.title}</span>
      {first && <Avatar user={first} size={20} />}
    </button>
  );
}
