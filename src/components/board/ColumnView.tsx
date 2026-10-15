"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArrowUpToLine, Check, CircleCheckBig, Gauge, MoreHorizontal, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CardSummary, ColumnData } from "@/lib/types";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlay";
import { Button } from "@/components/ui/basics";
import { CardTile, type CardActions } from "./CardTile";
import { ColorGrid } from "./pickers";

export type ColumnActions = {
  rename: (id: string, name: string) => void;
  patch: (id: string, patch: Partial<Pick<ColumnData, "color" | "isDone" | "wipLimit">>) => void;
  remove: (id: string) => void;
  /** open = abrir a demanda logo depois de criar */
  addCard: (columnId: string, title: string, atTop: boolean, open: boolean) => Promise<boolean>;
  archiveAll: (columnId: string) => void;
};

/** Fundo da coluna: a própria cor bem clarinha sobre o vidro (cards ficam claros por cima). */
export function columnTint(color: string | null) {
  return color ? { background: `color-mix(in srgb, ${color} 17%, var(--glass))` } : undefined;
}

export function ColumnDot({ column, size = 22 }: { column: Pick<ColumnData, "color" | "isDone">; size?: number }) {
  if (column.isDone) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-success text-white" style={{ width: size, height: size }}>
        <Check style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span className="rounded-full" style={{ width: size * 0.5, height: size * 0.5, background: column.color ?? "var(--fg-3)" }} />
    </span>
  );
}

export function ColumnView({
  index,
  column,
  cards,
  totalCount,
  cardActions,
  actions,
  dragDisabled,
}: {
  index: number;
  column: ColumnData;
  cards: CardSummary[];
  totalCount: number;
  cardActions: CardActions;
  actions: ColumnActions;
  dragDisabled?: boolean;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: `col-${column.id}`, data: { type: "column" }, disabled: dragDisabled });
  const { setNodeRef: setDropRef } = useDroppable({ id: `drop-${column.id}`, data: { type: "column-body", columnId: column.id } });
  const [adding, setAdding] = useState<null | "top" | "bottom">(null);
  const [editing, setEditing] = useState(false);
  const overLimit = column.wipLimit > 0 && totalCount > column.wipLimit;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, ...columnTint(column.color) }}
      className={cn("glass flex max-h-full w-[calc(100vw-48px)] shrink-0 snap-start flex-col rounded-[26px] shadow-sm sm:w-[300px]", isDragging && "opacity-40")}
      aria-label={`Coluna ${column.name}`}
      data-col-index={index}
    >
      <header
        className="flex items-center gap-2 px-3.5 pb-2 pt-3.5 touch-manipulation"
        {...attributes}
        {...listeners}
        aria-label={`Coluna ${column.name}: arraste para reordenar`}
        onKeyDown={(e) => {
          // só o próprio cabeçalho (com foco) começa o arraste pelo teclado
          if (e.target === e.currentTarget) listeners?.onKeyDown?.(e);
        }}
      >
        <ColumnDot column={column} />
        {editing ? (
          <InlineName
            value={column.name}
            onDone={(v) => {
              setEditing(false);
              if (v && v !== column.name) actions.rename(column.id, v);
            }}
          />
        ) : (
          <h3 className="min-w-0 truncate text-[15px] font-semibold" onDoubleClick={() => setEditing(true)}>
            {column.name}
          </h3>
        )}
        <span
          className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums", overLimit ? "bg-danger text-white" : "bg-surface/80 text-fg-2")}
          title={column.wipLimit ? `Limite de ${column.wipLimit} demandas` : undefined}
        >
          {column.wipLimit ? `${totalCount}/${column.wipLimit}` : totalCount}
        </span>
        <div className="ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label={`Nova demanda em ${column.name}`} onClick={() => setAdding("top")} className="inline-flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface hover:text-fg sm:size-8">
            <Plus className="size-[18px]" />
          </button>
          <ColumnMenu column={column} actions={actions} onRename={() => setEditing(true)} onAddTop={() => setAdding("top")} />
        </div>
      </header>

      <div ref={setDropRef} className="flex min-h-[64px] flex-1 flex-col gap-2.5 overflow-y-auto scroll-thin px-2.5 pb-2.5">
        {adding === "top" && <QuickAdd onCancel={() => setAdding(null)} onSave={(t, open) => actions.addCard(column.id, t, true, open)} />}
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardTile key={card.id} card={card} actions={cardActions} />
          ))}
        </SortableContext>
        {cards.length === 0 && totalCount > 0 && <p className="px-2 py-3 text-center text-xs text-fg-3">Nenhuma demanda com esses filtros.</p>}
        {adding === "bottom" ? (
          <QuickAdd onCancel={() => setAdding(null)} onSave={(t, open) => actions.addCard(column.id, t, false, open)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding("bottom")}
            className="flex h-10 shrink-0 items-center gap-2 rounded-2xl px-3 text-[13.5px] font-medium text-fg-2 transition-colors hover:bg-surface/70 hover:text-fg"
          >
            <Plus className="size-4" /> Nova demanda
          </button>
        )}
      </div>
    </section>
  );
}

function InlineName({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      autoFocus
      value={v}
      maxLength={60}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(v.trim());
        if (e.key === "Escape") onDone(value);
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim())}
      className="h-8 min-w-0 flex-1 rounded-lg bg-surface px-2 text-[15px] font-semibold outline-none ring-2 ring-[var(--focus)]"
    />
  );
}

/**
 * Criação rápida. Enter = cria e abre a demanda (a pessoa completa o resto na hora, sem procurar o card);
 * ⌘/Ctrl + Enter ou "Adicionar outra" = cria e deixa o campo aberto para a próxima.
 */
function QuickAdd({ onSave, onCancel }: { onSave: (title: string, open: boolean) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = async (open: boolean) => {
    const t = title.trim();
    if (!t) return open ? onCancel() : undefined;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // limpa já: quem digita rápido a próxima não perde o texto quando a resposta chegar
    setTitle("");
    const ok = await onSave(t, open);
    savingRef.current = false;
    setSaving(false);
    if (!ok) {
      setTitle((cur) => cur || t); // deu erro: devolve o título (se a pessoa ainda não escreveu outro)
      return;
    }
    if (open) return onCancel();
    ref.current?.focus();
  };
  return (
    <div className="animate-pop grid gap-2 rounded-[20px] bg-card p-2.5 shadow-sm ring-2 ring-transparent transition-shadow focus-within:ring-[var(--focus)]">
      <textarea
        ref={ref}
        value={title}
        rows={2}
        maxLength={200}
        aria-label="Título da nova demanda"
        placeholder="O que precisa ser feito?"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save(!(e.metaKey || e.ctrlKey));
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full resize-none bg-transparent px-1 text-[14.5px] outline-none placeholder:text-fg-3"
      />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="mr-auto hidden pl-1 text-[11px] text-fg-3 sm:inline">Enter abre · ⌘ Enter mais uma</span>
        <Button size="sm" variant="ghost" onClick={() => save(false)} disabled={saving || !title.trim()}>Adicionar outra</Button>
        <Button size="sm" variant="primary" loading={saving} onClick={() => save(true)}>Criar e abrir</Button>
      </div>
    </div>
  );
}

function ColumnMenu({ column, actions, onRename, onAddTop }: { column: ColumnData; actions: ColumnActions; onRename: () => void; onAddTop: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [wip, setWip] = useState(String(column.wipLimit || ""));
  const close = () => setOpen(false);
  return (
    <>
      <button ref={ref} type="button" aria-label="Opções da coluna" onClick={() => setOpen((v) => !v)} className="inline-flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface hover:text-fg sm:size-8">
        <MoreHorizontal className="size-[18px]" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={260} align="end">
        <MenuItem icon={<Pencil />} onClick={() => { close(); onRename(); }}>Renomear</MenuItem>
        <MenuItem icon={<ArrowUpToLine />} onClick={() => { close(); onAddTop(); }}>Nova demanda no topo</MenuItem>
        <MenuItem
          icon={<CircleCheckBig />}
          onClick={() => actions.patch(column.id, { isDone: !column.isDone })}
          hint={<span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", column.isDone ? "bg-success" : "bg-surface-3")}><span className={cn("block size-4 rounded-full bg-white shadow transition-transform", column.isDone && "translate-x-4")} /></span>}
        >
          Coluna de concluídas
        </MenuItem>
        <MenuLabel><span className="inline-flex items-center gap-1.5"><Palette className="size-3.5" /> Cor</span></MenuLabel>
        <div className="px-2.5 pb-2">
          <ColorGrid value={column.color} allowNone size={24} onChange={(c) => actions.patch(column.id, { color: c })} />
        </div>
        <MenuLabel><span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" /> Limite de demandas</span></MenuLabel>
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <input
            type="number"
            min={0}
            max={999}
            value={wip}
            placeholder="Sem limite"
            onChange={(e) => setWip(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && actions.patch(column.id, { wipLimit: Math.max(0, Number(wip) || 0) })}
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
          />
          <Button size="sm" onClick={() => actions.patch(column.id, { wipLimit: Math.max(0, Number(wip) || 0) })}>Salvar</Button>
        </div>
        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<Archive />} onClick={() => { close(); actions.archiveAll(column.id); }}>Arquivar todas as demandas</MenuItem>
        <MenuItem icon={<Trash2 />} danger onClick={() => { close(); actions.remove(column.id); }}>Excluir coluna</MenuItem>
      </Popover>
    </>
  );
}
