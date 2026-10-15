"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { CardSummary, ColumnData } from "@/lib/types";
import { relativeTime, shortDay } from "@/lib/dates";
import { Avatar, Button, Field, Input, Textarea } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { createBoard, duplicateBoard, listArchivedCards, listBoardTemplates, saveBoardTemplate, updateBoard } from "@/app/actions/boards";
import { archiveCard, createCard, deleteCard } from "@/app/actions/cards";
import { AssigneeList, ClientDot, ClientList, ColorGrid, DateList, PopoverButton } from "./pickers";
import { listTemplates, type TemplateData } from "@/app/actions/templates";
import { cn } from "@/lib/cn";
import { ColumnDot } from "./ColumnView";
import { useLookups, useLookupsSafe } from "./lookups";
import { PALETTE } from "@/lib/domain";

type NewCardProps = { open: boolean; onClose: () => void; boardId: string; boardClientId?: string | null; columns: ColumnData[]; onCreated: (c: CardSummary) => void };

export function NewCardModal(props: NewCardProps) {
  return props.open ? <NewCardInner {...props} /> : null;
}

function NewCardInner({ open, onClose, boardId, boardClientId, columns, onCreated }: NewCardProps) {
  const { toast } = useFeedback();
  const { userById, clientById } = useLookups();
  const [clientId, setClientId] = useState<string | null>(boardClientId ?? null);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    listTemplates().then((res) => res.ok && setTemplates(res.data));
  }, []);
  const [title, setTitle] = useState("");
  const [columnId, setColumnId] = useState(() => columns.find((c) => !c.isDone)?.id ?? columns[0]?.id ?? "");
  const [due, setDue] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (savingRef.current || !title.trim()) return;
    if (!columnId) return toast("Crie uma coluna primeiro.", "error");
    savingRef.current = true;
    setSaving(true);
    const res = await createCard({ boardId, columnId, title, dueDate: due, assigneeIds: assignees, clientId, templateId });
    savingRef.current = false;
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    onCreated(res.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova demanda"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!title.trim()}>Criar e abrir</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {templates.length > 0 && (
          <Field group label="Começar de um modelo">
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    const on = templateId === t.id;
                    setTemplateId(on ? null : t.id);
                    if (!on && !title.trim()) setTitle(t.title);
                  }}
                  className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors", templateId === t.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-fg-2 hover:text-fg")}
                >
                  {t.name}
                  {t.checklist.length > 0 && <span className="ml-1.5 text-[11px] opacity-70">{t.checklist.length} itens</span>}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Título">
          <Input autoFocus value={title} maxLength={200} placeholder="Ex.: Arte do post de lançamento" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && title.trim() && save()} />
        </Field>
        <Field group label="Coluna">
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColumnId(c.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full pl-1.5 pr-3.5 text-[13px] font-medium transition-colors ${columnId === c.id ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2 hover:text-fg"}`}
              >
                <ColumnDot column={c} size={20} />
                {c.name}
              </button>
            ))}
          </div>
        </Field>
        <Field group label="Cliente">
          <PopoverButton
            width={280}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-left text-sm"
            button={clientId && clientById.get(clientId) ? <><ClientDot color={clientById.get(clientId)!.color} />{clientById.get(clientId)!.name}</> : <span className="text-fg-3">Sem cliente</span>}
          >
            {(close) => <ClientList value={clientId} onChange={(v) => { setClientId(v); close(); }} />}
          </PopoverButton>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field group label="Prazo">
            <PopoverButton
              className="flex h-10 w-full items-center rounded-xl border border-border bg-surface px-3.5 text-left text-sm"
              button={due ? shortDay(due) : <span className="text-fg-3">Sem prazo</span>}
            >
              {(close) => <DateList value={due} onChange={(v) => { setDue(v); close(); }} />}
            </PopoverButton>
          </Field>
          <Field group label="Responsáveis">
            <PopoverButton
              className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface px-2 text-left text-sm"
              button={
                assignees.length ? (
                  <span className="flex items-center -space-x-1.5">{assignees.map((id) => userById.get(id)).filter(Boolean).map((u) => <Avatar key={u!.id} user={u!} size={26} ring />)}</span>
                ) : (
                  <span className="px-1.5 text-fg-3">Ninguém ainda</span>
                )
              }
            >
              {() => <AssigneeList selected={assignees} onToggle={(id) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))} />}
            </PopoverButton>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export const TEMPLATES = [
  { id: "basico", name: "Básico", columns: "A fazer, Fazendo, Revisão, Concluído" },
  { id: "conteudo", name: "Produção de conteúdo", columns: "Ideias, Briefing, Produção, Revisão interna, Aprovação do cliente, Publicado" },
  { id: "sprint", name: "Semana da equipe", columns: "Backlog, Esta semana, Em andamento, Bloqueado, Feito" },
  { id: "vazio", name: "Em branco", columns: "Você monta as colunas" },
];

type BoardFormProps = {
  open: boolean;
  onClose: () => void;
  board?: { id: string; name: string; description: string | null; color: string; clientId?: string | null };
  /** Pasta onde o quadro novo nasce (criado de dentro de uma pasta). */
  folderId?: string | null;
  onSaved: (b: { id: string; name: string; description: string | null; color: string; clientId: string | null }) => void;
};

export function BoardFormModal(props: BoardFormProps) {
  return props.open ? <BoardFormInner {...props} /> : null;
}

function BoardFormInner({ open, onClose, board, folderId, onSaved }: BoardFormProps) {
  const { toast } = useFeedback();
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [color, setColor] = useState(board?.color ?? PALETTE[7]);
  const [template, setTemplate] = useState("basico");
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState<string | null>(board?.clientId ?? null);
  const { clientById } = useLookupsSafe();
  const [savedTemplates, setSavedTemplates] = useState<{ id: string; name: string; columns: string[]; cardCount: number }[]>([]);
  useEffect(() => {
    if (!board) listBoardTemplates().then((res) => res.ok && setSavedTemplates(res.data));
  }, [board]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const payload = { name, description: description.trim() || null, color, clientId };
    const res = board ? await updateBoard(board.id, payload) : await createBoard({ ...payload, template, folderId: folderId ?? null });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    onSaved({ id: board?.id ?? (res.data as { id: string }).id, ...payload });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={board ? "Editar quadro" : "Novo quadro"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!name.trim()}>{board ? "Salvar" : "Criar quadro"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome">
          <Input autoFocus value={name} maxLength={80} placeholder="Ex.: Cliente Aurora, Social media, Site" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição (opcional)">
          <Textarea value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field group label="Cor">
          <ColorGrid value={color} onChange={(c) => c && setColor(c)} size={28} />
        </Field>
        {clientById && (
          <Field group label="Cliente padrão (opcional)" hint="Toda demanda nova deste quadro já nasce com esse cliente.">
            <PopoverButton
              width={280}
              className="flex h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-left text-sm"
              button={clientId && clientById.get(clientId) ? <><ClientDot color={clientById.get(clientId)!.color} />{clientById.get(clientId)!.name}</> : <span className="text-fg-3">Nenhum</span>}
            >
              {(close) => <ClientList value={clientId} onChange={(v) => { setClientId(v); close(); }} />}
            </PopoverButton>
          </Field>
        )}
        {!board && (
          <Field group label="Começar com">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ...savedTemplates.map((t) => ({ id: `tpl:${t.id}`, name: t.name, columns: t.columns.join(", ") + (t.cardCount ? ` · ${t.cardCount} demandas` : ""), saved: true })),
                ...TEMPLATES.map((t) => ({ ...t, saved: false })),
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={template === t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`grid gap-0.5 rounded-2xl p-3 text-left transition-colors ${template === t.id ? "bg-panel text-panel-fg" : "bg-surface-2 hover:bg-surface-3"}`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {t.name}
                    {t.saved && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${template === t.id ? "bg-panel-fg text-panel" : "bg-panel text-panel-fg"}`}>da equipe</span>}
                  </span>
                  <span className={`line-clamp-2 text-xs ${template === t.id ? "text-panel-fg-2" : "text-fg-3"}`}>{t.columns}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

type ArchivedProps = { open: boolean; onClose: () => void; boardId: string; onRestored: (c: CardSummary) => void };

export function ArchivedModal(props: ArchivedProps) {
  return props.open ? <ArchivedInner {...props} /> : null;
}

function ArchivedInner({ open, onClose, boardId, onRestored }: ArchivedProps) {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<{ id: string; number: number; title: string; archivedAt: string; columnName: string }[] | null>(null);

  useEffect(() => {
    listArchivedCards(boardId).then((res) => (res.ok ? setItems(res.data) : toast(res.error, "error")));
  }, [boardId, toast]);

  return (
    <Modal open={open} onClose={onClose} title="Demandas arquivadas" size="md">
      <div className="grid gap-1.5">
        {items === null && <p className="py-6 text-center text-sm text-fg-3">Carregando...</p>}
        {items?.length === 0 && <p className="py-6 text-center text-sm text-fg-3">Nenhuma demanda arquivada neste quadro.</p>}
        {items?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
            <span className="font-mono text-xs text-fg-3">#{c.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.title}</span>
              <span className="text-xs text-fg-3">{c.columnName} · arquivada {relativeTime(c.archivedAt)}</span>
            </span>
            <Button
              size="sm"
              onClick={async () => {
                const res = await archiveCard(c.id, false);
                if (!res.ok) return toast(res.error, "error");
                onRestored(res.data);
                setItems((all) => all?.filter((x) => x.id !== c.id) ?? null);
                toast("Demanda restaurada");
              }}
            >
              <RotateCcw className="size-3.5" /> Restaurar
            </Button>
            <button
              type="button"
              aria-label="Excluir para sempre"
              onClick={async () => {
                const ok = await confirm({ title: "Excluir para sempre?", text: `"${c.title}" e tudo dentro dela some de vez.`, confirm: "Excluir", danger: true });
                if (!ok) return;
                const res = await deleteCard(c.id);
                if (!res.ok) return toast(res.error, "error");
                setItems((all) => all?.filter((x) => x.id !== c.id) ?? null);
              }}
              className="inline-flex size-8 items-center justify-center rounded-full text-fg-3 hover:bg-surface hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function DeleteColumnModal({ column, columns, count, onClose, onConfirm }: { column: ColumnData; columns: ColumnData[]; count: number; onClose: () => void; onConfirm: (moveTo: string) => void }) {
  const others = columns.filter((c) => c.id !== column.id);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Excluir a coluna "${column.name}"?`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={!target} onClick={() => onConfirm(target)}>Mover e excluir</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-fg-2">
          Ela tem {count} {count === 1 ? "demanda" : "demandas"}. Escolha para onde elas vão antes de excluir.
        </p>
        {others.length === 0 ? (
          <p className="text-sm text-danger">Crie outra coluna antes, para não perder as demandas.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {others.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setTarget(c.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full pl-1.5 pr-3.5 text-[13px] font-medium ${target === c.id ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2"}`}
              >
                <ColumnDot column={c} size={20} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Duplicar quadro ou salvar como modelo de quadro. */
export function BoardCopyModal({ mode, boardId, boardName, onClose, onDone }: { mode: "duplicate" | "saveTemplate"; boardId: string; boardName: string; onClose: () => void; onDone: (newBoardId: string | null) => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(mode === "duplicate" ? `${boardName} (cópia)`.slice(0, 80) : boardName.slice(0, 60));
  const [withCards, setWithCards] = useState(true);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = mode === "duplicate" ? await duplicateBoard(boardId, { name, withCards }) : await saveBoardTemplate(boardId, { name, withCards });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast(mode === "duplicate" ? "Quadro duplicado" : "Modelo salvo. Use em Novo quadro.");
    onDone(mode === "duplicate" ? (res.data as { id: string }).id : null);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "duplicate" ? "Duplicar quadro" : "Salvar como modelo de quadro"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>{mode === "duplicate" ? "Duplicar" : "Salvar modelo"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={mode === "duplicate" ? "Nome do quadro novo" : "Nome do modelo"}>
          <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
          <span>
            <span className="block font-medium">{mode === "duplicate" ? "Levar as demandas" : "Incluir as demandas em aberto"}</span>
            <span className="text-xs text-fg-3">
              {mode === "duplicate" ? "Copia as demandas não arquivadas, com checklist, etiquetas e pessoas." : "Viram demandas de partida (título, texto, etiquetas e checklist) em todo quadro novo com este modelo."}
            </span>
          </span>
          <input type="checkbox" className="sr-only" checked={withCards} onChange={(e) => setWithCards(e.target.checked)} />
          <span aria-hidden className={cn("h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors", withCards ? "bg-accent" : "bg-surface-3")}>
            <span className={cn("block size-4 rounded-full bg-white shadow transition-transform", withCards && "translate-x-4")} />
          </span>
        </label>
      </div>
    </Modal>
  );
}
