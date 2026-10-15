"use client";

import { useMemo, useState } from "react";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { cn } from "@/lib/cn";
import type { CardSummary } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { CalendarView } from "@/components/board/CalendarView";
import { CardModal, type CardChange } from "@/components/board/CardModal";

export function AgendaView({ cards: initial, boards, meId }: { cards: CardSummary[]; boards: { id: string; name: string; color: string }[]; meId: string }) {
  const [cards, setCards] = useState(initial);
  const [mine, setMine] = useState(true);
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCards(initial);
  }

  const colors = useMemo(() => Object.fromEntries(boards.map((b) => [b.id, b.color])), [boards]);
  const visible = cards.filter((c) => (!mine || c.assigneeIds.includes(meId)) && (!boardFilter || c.boardId === boardFilter));
  const upsert = (s: CardChange) =>
    setCards((all) => {
      if (!("boardId" in s && "columnId" in s)) return all.map((x) => (x.id === s.id ? { ...x, ...s } : x));
      const full = s as CardSummary;
      if (full.archivedAt) return all.filter((x) => x.id !== full.id);
      return all.some((x) => x.id === full.id) ? all.map((x) => (x.id === full.id ? full : x)) : [...all, full];
    });

  return (
    <div className="pb-10">
      <LiveRefresh />
      <PageHeader
        title="Agenda"
        subtitle="Prazos de todos os quadros. Arraste uma demanda para outro dia para mudar o prazo."
        actions={
          <>
            <div className="glass-strong flex h-11 items-center rounded-full p-1">
              {([
                [true, "Minhas"],
                [false, "Da equipe"],
              ] as const).map(([v, label]) => (
                <button key={label} type="button" onClick={() => setMine(v)} className={cn("h-9 rounded-full px-4 text-[13.5px] font-medium", mine === v ? "bg-surface text-fg shadow-sm" : "text-fg-2")}>
                  {label}
                </button>
              ))}
            </div>
            <select
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
              aria-label="Quadro"
              className="glass-strong h-11 rounded-full px-4 text-[13.5px] font-medium outline-none"
            >
              <option value="">Todos os quadros</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </>
        }
      />
      <div className="px-4 lg:px-6">
        <CalendarView cards={visible} onOpen={setOpen} onChange={upsert} boardColors={colors} />
      </div>
      {open && (
        <CardModal
          key={open}
          cardId={open}
          onClose={() => setOpen(null)}
          onChange={upsert}
          onRemoved={(id) => {
            setCards((all) => all.filter((x) => x.id !== id));
            setOpen(null);
          }}
          onOpenOther={setOpen}
        />
      )}
    </div>
  );
}
