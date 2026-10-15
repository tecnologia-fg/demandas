"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CardSummary, ColumnData } from "@/lib/types";
import { AvatarStack, LabelChip, RoundCheck } from "@/components/ui/basics";
import { DueChip, type CardActions } from "./CardTile";
import { ColumnDot } from "./ColumnView";
import { PriorityIcon } from "./pickers";
import { useLookups } from "./lookups";

export function ListView({
  columns,
  order,
  cards,
  visible,
  actions,
}: {
  columns: ColumnData[];
  order: Record<string, string[]>;
  cards: Record<string, CardSummary>;
  visible: Set<string>;
  actions: CardActions;
}) {
  const { userById, labelById, clientById } = useLookups();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  return (
    <div className="grid gap-4">
      {columns.map((col) => {
        const list = (order[col.id] ?? []).filter((id) => visible.has(id)).map((id) => cards[id]);
        const isClosed = closed.has(col.id);
        return (
          <section key={col.id} className="glass overflow-hidden rounded-[26px]" style={col.color ? { background: `color-mix(in srgb, ${col.color} 12%, var(--glass))` } : undefined}>
            <button
              type="button"
              onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(col.id)) n.delete(col.id); else n.add(col.id); return n; })}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            >
              <ChevronDown className={cn("size-4 text-fg-3 transition-transform", isClosed && "-rotate-90")} />
              <ColumnDot column={col} />
              <span className="font-semibold">{col.name}</span>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface/80 px-2 text-xs font-semibold text-fg-2">{list.length}</span>
            </button>
            {!isClosed && (
              <div className="grid gap-1 px-2 pb-2">
                {list.length === 0 && <p className="px-3 pb-2 text-sm text-fg-3">Nada aqui.</p>}
                {list.map((c) => {
                  const done = Boolean(c.completedAt);
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => actions.open(c.id)}
                      onKeyDown={(e) => e.key === "Enter" && actions.open(c.id)}
                      className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]"
                    >
                      <RoundCheck checked={done} label={done ? "Reabrir" : "Concluir"} size={19} onChange={() => actions.toggleComplete(c.id)} />
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-fg-3">#{c.number}</span>
                        <span className={cn("truncate text-[14px] font-medium", done && "text-fg-3 line-through")}>{c.title}</span>
                        {c.clientId && clientById.get(c.clientId) && (
                          <span className="hidden shrink-0 items-center gap-1 text-xs text-fg-3 sm:inline-flex">
                            <span className="size-2 rounded-full" style={{ background: clientById.get(c.clientId)!.color }} />
                            {clientById.get(c.clientId)!.name}
                          </span>
                        )}
                        <span className="hidden gap-1 lg:flex">
                          {c.labelIds.slice(0, 3).map((id) => {
                            const l = labelById.get(id);
                            return l ? <LabelChip key={id} name={l.name} color={l.color} size="xs" /> : null;
                          })}
                        </span>
                      </div>
                      <span className="hidden items-center gap-2 text-xs text-fg-3 md:flex">
                        {c.commentCount > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{c.commentCount}</span>}
                        {c.attachmentCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" />{c.attachmentCount}</span>}
                      </span>
                      <span className="hidden w-6 md:block"><PriorityIcon priority={c.priority} size={22} /></span>
                      <span className="hidden w-[92px] md:block">{c.dueDate && <DueChip due={c.dueDate} done={done} size="xs" />}</span>
                      <span className="flex w-[84px] justify-end">
                        <AvatarStack users={c.assigneeIds.map((id) => userById.get(id)!).filter(Boolean)} size={24} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
