"use client";

import { memo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Archive, ArrowRight, CalendarDays, Copy, MessageCircle, MoreHorizontal, Paperclip, Repeat, Trash2, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { StatusChip } from "@/components/approvals/ui";
import { PRIORITY_META, type Priority } from "@/lib/domain";
import { dueState, shortDay } from "@/lib/dates";
import type { CardSummary } from "@/lib/types";
import { AvatarStack, LabelChip, RoundCheck } from "@/components/ui/basics";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlay";
import { ClientPill, PriorityIcon } from "./pickers";
import { useLookups } from "./lookups";

export type CardActions = {
  open: (id: string) => void;
  /** colunas do quadro, para o "Mover para…" do menu */
  columns: { id: string; name: string; color: string | null; isDone: boolean }[];
  moveTo: (id: string, columnId: string) => void;
  toggleComplete: (id: string) => void;
  duplicate: (id: string) => void;
  archive: (id: string) => void;
  remove: (id: string) => void;
};

export function DueChip({ due, done, size = "sm" }: { due: string; done: boolean; size?: "sm" | "xs" }) {
  const state = dueState(due, done);
  const solid: Record<string, string> = {
    late: "bg-danger text-white",
    today: "bg-accent text-accent-ink",
    done: "bg-success text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
        state && solid[state] ? solid[state] : "bg-surface-2 text-fg-2",
      )}
      title={state === "late" ? "Atrasada" : undefined}
    >
      <CalendarDays className="size-3.5" />
      {shortDay(due)}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority as Priority];
  if (!meta) return null;
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 pl-1 pr-2.5 text-xs font-medium text-fg-2">
      <PriorityIcon priority={priority} size={20} />
      {meta.label}
    </span>
  );
}

function CardBody({ card, actions, dragging }: { card: CardSummary; actions?: CardActions; dragging?: boolean }) {
  const { userById, labelById, clientById } = useLookups();
  const client = card.clientId ? clientById.get(card.clientId) : undefined;
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const done = Boolean(card.completedAt);
  const assignees = card.assigneeIds.map((id) => userById.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  const labels = card.labelIds.map((id) => labelById.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const pct = card.checklist.total ? Math.round((card.checklist.done / card.checklist.total) * 100) : null;
  const hasMeta = card.commentCount > 0 || card.attachmentCount > 0 || card.hasDescription || card.repeatEvery || card.timerRunning;

  return (
    <div
      className={cn(
        "group relative grid gap-2.5 rounded-[20px] bg-card p-3.5 text-left shadow-sm transition-shadow",
        dragging ? "rotate-[1.5deg] shadow-lg" : "hover:shadow-md",
      )}
    >
      {card.coverImageId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/anexos/${card.coverImageId}`} alt="" loading="lazy" draggable={false} className="-mx-1.5 -mt-1.5 aspect-[4/3] w-[calc(100%+12px)] max-w-none rounded-[14px] bg-surface-2 object-cover object-top" />
      ) : card.coverColor ? (
        <div className="-mx-1.5 -mt-1.5 h-10 rounded-[14px]" style={{ background: card.coverColor }} />
      ) : null}

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {client ? (
            <ClientPill name={client.name} color={client.color} imageUrl={client.imageUrl} size="xs" />
          ) : labels.length > 0 ? (
            labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} size="xs" />)
          ) : (
            <span className="font-mono text-[11px] text-fg-3">#{card.number}</span>
          )}
        </div>
        {actions && (
          <>
            <button
              ref={menuRef}
              type="button"
              aria-label="Ações da demanda"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((v) => !v);
              }}
              className={cn("-mr-1.5 -mt-1.5 inline-flex size-9 items-center justify-center rounded-full sm:-mr-1 sm:-mt-1 sm:size-7 text-fg-3 hover:bg-surface-2 hover:text-fg", !menu && "lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100")}
            >
              <MoreHorizontal className="size-4" />
            </button>
            <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} width={230} align="end">
              <MenuLabel>Mover para</MenuLabel>
              {actions.columns.filter((c) => c.id !== card.columnId).map((c) => (
                <MenuItem key={c.id} icon={<ArrowRight />} onClick={() => { setMenu(false); actions.moveTo(card.id, c.id); }}>{c.name}</MenuItem>
              ))}
              <div className="my-1 h-px bg-border" />
              <MenuItem icon={<Copy />} onClick={() => { setMenu(false); actions.duplicate(card.id); }}>Duplicar</MenuItem>
              <MenuItem icon={<Archive />} onClick={() => { setMenu(false); actions.archive(card.id); }}>Arquivar</MenuItem>
              <MenuItem icon={<Trash2 />} danger onClick={() => { setMenu(false); actions.remove(card.id); }}>Excluir</MenuItem>
            </Popover>
          </>
        )}
      </div>

      {client && labels.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-1">
          {labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} size="xs" />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2.5">
        {actions && (
          <span className={cn("mt-px", !done && "lg:hidden lg:group-hover:inline-flex")} onPointerDown={(e) => e.stopPropagation()}>
            <RoundCheck checked={done} label={done ? "Reabrir demanda" : "Concluir demanda"} size={19} onChange={() => actions.toggleComplete(card.id)} />
          </span>
        )}
        <p className={cn("min-w-0 flex-1 text-[14.5px] font-medium leading-snug [overflow-wrap:anywhere]", done && "text-fg-3 line-through decoration-fg-3/60")}>{card.title}</p>
      </div>

      {(card.priority || card.dueDate || card.approval) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {card.approval && <StatusChip status={card.approval} size="xs" />}
          {card.priority && <PriorityChip priority={card.priority} />}
          {card.dueDate && <DueChip due={card.dueDate} done={done} />}
        </div>
      )}

      {pct !== null && (
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-12 text-right text-[11px] font-medium tabular-nums text-fg-3">
            {card.checklist.done}/{card.checklist.total}
          </span>
        </div>
      )}

      {(assignees.length > 0 || hasMeta) && (
        <div className="flex items-center gap-2 border-t border-border/70 pt-2.5">
          <AvatarStack users={assignees} size={24} />
          <div className="ml-auto flex items-center gap-2.5 text-fg-3">
            {card.timerRunning && (
              <span title="Cronômetro rodando" className="inline-flex size-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Timer className="size-3.5" />
              </span>
            )}
            {card.repeatEvery && <Repeat className="size-3.5" aria-label="Repete" />}
            {card.hasDescription && <AlignLeft className="size-3.5" aria-label="Tem descrição" />}
            {card.commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                <MessageCircle className="size-3.5" />
                {card.commentCount}
              </span>
            )}
            {card.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                <Paperclip className="size-3.5" />
                {card.attachmentCount}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const CardTile = memo(function CardTile({ card, actions }: { card: CardSummary; actions: CardActions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: "card" } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation outline-none", isDragging && "opacity-35")}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`Demanda #${card.number}: ${card.title}`}
      onClick={() => actions.open(card.id)}
      onKeyDown={(e) => {
        // teclas em botões de dentro do card (check, menu) não abrem nem arrastam o card
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") return actions.open(card.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardBody card={card} actions={actions} />
    </div>
  );
});

export function CardOverlay({ card }: { card: CardSummary }) {
  return (
    <div className="w-[300px] cursor-grabbing">
      <CardBody card={card} dragging />
    </div>
  );
}
