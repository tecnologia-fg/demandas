"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlignLeft, Archive, ArrowRightLeft, Building2, LayoutTemplate, CalendarDays, CalendarRange, ChevronDown, Clock, Copy, FileText, Flag, History, Image as ImageIcon,
  Link2, ListChecks, MessageCircle, MoreHorizontal, Paintbrush, Paperclip, Pause, Play, Plus, Repeat, Tag, Trash2, Upload, Users, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ACTIVITY_TEXT, PRIORITY_META, REPEATS, REPEAT_LABEL, type Priority } from "@/lib/domain";
import { formatBytes, formatMinutes, relativeTime, shortDay } from "@/lib/dates";
import type { CardDetail, CardSummary, UserLite } from "@/lib/types";
import { Avatar, Button, Field, Input, LabelChip, RoundCheck } from "@/components/ui/basics";
import { MenuItem, Modal, Popover, useFeedback, useModalClose } from "@/components/ui/overlay";
import {
  archiveCard, deleteCard, duplicateCard, getCardDetail, moveCard, moveCardToBoard, setAssignees, setClient, setLabels, toggleComplete, updateCard,
} from "@/app/actions/cards";
import {
  addChecklist, addChecklistItem, addComment, deleteAttachment, deleteChecklist, deleteChecklistItem, deleteComment, editComment,
  renameChecklist, startTimer, stopTimer, updateChecklistItem,
} from "@/app/actions/card-extras";
import { listBoardsForMove } from "@/app/actions/boards";
import { AssigneeList, ClientDot, ClientList, ColorGrid, DateList, LabelList, PopoverButton, PriorityIcon, PriorityList } from "./pickers";
import { templateFromCard } from "@/app/actions/templates";
import { ColumnDot } from "./ColumnView";
import { useLookups } from "./lookups";
import { useLive } from "@/components/live/LiveProvider";
import { RichContent, RichEditor } from "@/components/editor/RichEditor";
import { ApprovalSection } from "@/components/approvals/ApprovalSection";

/** Demanda completa (vinda do servidor) ou só os campos que mudaram. */
export type CardChange = CardSummary | (Partial<CardSummary> & { id: string });

const SUMMARY_KEYS = [
  "title", "priority", "startDate", "dueDate", "completedAt", "coverColor", "coverImageId", "repeatEvery", "clientId", "hasDescription",
  "assigneeIds", "labelIds", "checklist", "commentCount", "attachmentCount", "timerRunning",
] as const;

/** Só os campos de resumo que mudaram entre duas versões da demanda. */
function diffSummary(a: CardDetail, b: CardDetail): CardChange | null {
  const out: Partial<CardSummary> & { id: string } = { id: b.id };
  let any = false;
  for (const k of SUMMARY_KEYS) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      (out as Record<string, unknown>)[k] = b[k];
      any = true;
    }
  }
  return any ? out : null;
}

type Props = {
  cardId: string;
  onClose: () => void;
  onChange: (c: CardChange) => void;
  onRemoved: (id: string) => void;
  onOpenOther?: (id: string) => void;
};

export function CardModal({ cardId, onClose, onChange, onRemoved, onOpenOther }: Props) {
  const { toast, confirm } = useFeedback();
  const { me } = useLookups();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [dragFile, setDragFile] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const load = useCallback(async () => {
    const res = await getCardDetail(cardId);
    if (res.ok) setCard(res.data);
    else setError(res.error);
  }, [cardId]);

  useEffect(() => {
    getCardDetail(cardId).then((res) => (res.ok ? setCard(res.data) : setError(res.error)));
  }, [cardId]);


  const cardRef = useRef<CardDetail | null>(null);
  useLayoutEffect(() => {
    cardRef.current = card;
  }, [card]);

  const patch: Patch = useCallback(
    (fn, notify = true) => {
      const cur = cardRef.current;
      if (!cur) return;
      const next = fn(cur);
      cardRef.current = next;
      setCard(next);
      if (notify) {
        const delta = diffSummary(cur, next);
        if (delta) onChange(delta);
      }
    },
    [onChange],
  );

  // outra pessoa mexeu nesta demanda: recarrega os detalhes (comentários, checklist, anexos...)
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive((e) => {
    if (e.type !== "board" || e.cardId !== cardId || e.actorId === me.id) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(async () => {
      const res = await getCardDetail(cardId);
      if (res.ok) patch(() => res.data, false);
    }, 300);
  });

  /** Aplica o resumo devolvido pelo servidor na janela e no quadro. */
  const applySummary = useCallback(
    (s: CardSummary, extra?: Partial<CardDetail>) => {
      setCard((c) => (c ? { ...c, ...s, ...extra } : c));
      onChange(s);
    },
    [onChange],
  );

  const refreshActivity = useCallback(async () => {
    const res = await getCardDetail(cardId);
    if (res.ok) setCard((c) => (c ? { ...c, activities: res.data.activities, timeSpentMin: res.data.timeSpentMin } : c));
  }, [cardId]);

  const save = useCallback(
    async (patch: Parameters<typeof updateCard>[1]) => {
      const res = await updateCard(cardId, patch);
      if (!res.ok) {
        toast(res.error, "error");
        return false;
      }
      applySummary(res.data, "description" in patch ? { description: patch.description ?? null } : "estimatedMin" in patch ? { estimatedMin: patch.estimatedMin ?? null } : undefined);
      void refreshActivity();
      return true;
    },
    [cardId, applySummary, toast, refreshActivity],
  );

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        toast(`${file.name} passa de 25 MB.`, "error");
        continue;
      }
      setUploading((n) => n + 1);
      const form = new FormData();
      form.append("file", file);
      form.append("cardId", cardId);
      try {
        const res = await fetch("/api/anexos", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) toast(data.error ?? "Não deu para enviar.", "error");
        else
          patch((c) => ({ ...c, attachments: [data, ...c.attachments], attachmentCount: c.attachmentCount + 1 }));
      } catch {
        toast("Falha de conexão no envio.", "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    void refreshActivity();
  };

  if (!card) {
    return (
      <Modal open onClose={onClose} bare size="xl" label="Demanda" mobileFull>
        {error ? (
          <div className="grid min-h-[300px] place-content-center justify-items-center gap-3 p-8 text-sm text-fg-3">
            <p>{error}</p>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <div className="grid min-h-[min(640px,80vh)] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_290px]" aria-busy="true" aria-label="Carregando demanda">
            <div className="grid content-start gap-5">
              <div className="h-9 w-32 animate-pulse rounded-full bg-surface-2" />
              <div className="h-8 w-3/4 animate-pulse rounded-xl bg-surface-2" />
              <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
              <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
            </div>
            <div className="grid content-start gap-3">
              <div className="h-12 animate-pulse rounded-2xl bg-surface-2" />
              <div className="h-72 animate-pulse rounded-[20px] bg-surface-2" />
            </div>
          </div>
        )}
      </Modal>
    );
  }

  const done = Boolean(card.completedAt);
  const column = card.boardColumns.find((c) => c.id === card.columnId);

  return (
    <Modal open onClose={onClose} bare size="xl" label="Demanda" mobileFull>
      <div
        className="relative"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragFile(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragFile(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            setDragFile(false);
            void upload(e.dataTransfer.files);
          }
        }}
      >
        {dragFile && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-[22px] bg-accent/90 text-lg font-semibold text-accent-ink">
            <Upload className="mr-2 size-5" /> Solte para anexar
          </div>
        )}
        {card.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/anexos/${card.coverImageId}`} alt="" className="h-40 w-full object-cover sm:h-52" />
        ) : card.coverColor ? (
          <div className="h-16 sm:h-20" style={{ background: card.coverColor }} />
        ) : null}

        {/* Barra do topo (fixa ao rolar, principalmente no celular) */}
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-surface/90 px-4 pb-2 pt-3 backdrop-blur sm:static sm:bg-transparent sm:px-6 sm:pt-4 sm:backdrop-blur-none">
          <PopoverButton
            label="Mudar de coluna"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 pl-1.5 pr-3 text-[13px] font-medium hover:bg-surface-3"
            button={
              <>
                {column && <ColumnDot column={column} size={22} />}
                {card.columnName}
                <ChevronDown className="size-3.5 text-fg-3" />
              </>
            }
          >
            {(close) =>
              card.boardColumns.map((c) => (
                <MenuItem
                  key={c.id}
                  active={c.id === card.columnId}
                  icon={<ColumnDot column={c} size={18} />}
                  onClick={async () => {
                    close();
                    if (c.id === card.columnId) return;
                    const res = await moveCard({ cardId, toColumnId: c.id, toIndex: 0 });
                    if (!res.ok) return toast(res.error, "error");
                    applySummary(res.data.card, { columnName: c.name });
                    if (res.data.spawned) {
                      onChange(res.data.spawned);
                      toast(`Próxima repetição criada (#${res.data.spawned.number})`);
                    }
                    void refreshActivity();
                  }}
                >
                  {c.name}
                </MenuItem>
              ))
            }
          </PopoverButton>
          <span className="hidden truncate text-[13px] text-fg-3 sm:inline">em {card.boardName}</span>
          <span className="font-mono text-xs text-fg-3">#{card.number}</span>
          <div className="ml-auto flex items-center gap-1">
            <CardMenu
              onDuplicate={async () => {
                const res = await duplicateCard(cardId);
                if (!res.ok) return toast(res.error, "error");
                onChange(res.data);
                toast("Demanda duplicada");
                onOpenOther?.(res.data.id);
              }}
              onMove={() => setMoveOpen(true)}
              onTemplate={() => setTemplateOpen(true)}
              onCopyLink={async () => {
                const url = `${window.location.origin}/quadros/${card.boardId}?demanda=${card.id}`;
                await navigator.clipboard.writeText(url).catch(() => {});
                toast("Link copiado");
              }}
              onArchive={async () => {
                const res = await archiveCard(cardId, true);
                if (!res.ok) return toast(res.error, "error");
                onChange(res.data);
                onClose();
                toast("Demanda arquivada");
              }}
              onDelete={async () => {
                const ok = await confirm({ title: "Excluir demanda?", text: "Some para sempre, com comentários e anexos. Se quiser só tirar do quadro, arquive.", confirm: "Excluir", danger: true });
                if (!ok) return;
                const res = await deleteCard(cardId);
                if (!res.ok) return toast(res.error, "error");
                onRemoved(cardId);
              }}
            />
            <CloseButton fallback={onClose} />
          </div>
        </div>

        <div className="px-4 pt-1 sm:px-6 sm:pt-3">
          <TitleEditor key={card.title} value={card.title} done={done} onSave={(title) => save({ title })} />
        </div>
        <div className="grid gap-6 px-4 pb-8 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          {/* Coluna principal */}
          <div className="grid min-w-0 content-start gap-7">

            <Section icon={<AlignLeft />} title="Descrição">
              <DescriptionEditor key={card.description ?? ""} value={card.description} onSave={(description) => save({ description })} />
            </Section>

            <Checklists card={card} patch={patch} />

            <Section
              icon={<Paperclip />}
              title="Anexos"
              action={
                <Button size="sm" variant="ghost" onClick={() => uploadRef.current?.click()} loading={uploading > 0}>
                  <Upload className="size-3.5" /> Enviar
                </Button>
              }
            >
              <input ref={uploadRef} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files).then(() => (e.target.value = ""))} />
              <Attachments card={card} patch={patch} onPick={() => uploadRef.current?.click()} />
            </Section>

            <ApprovalSection card={card} onSummary={(sum) => applySummary(sum)} onReload={load} />

            <Conversation card={card} patch={patch} />
          </div>

          {/* Propriedades (no celular vêm logo abaixo do título, como nos apps de tarefas) */}
          <aside className="order-first grid content-start gap-3 lg:order-none">
            <button
              type="button"
              onClick={async () => {
                const res = await toggleComplete(cardId);
                if (!res.ok) return toast(res.error, "error");
                applySummary(res.data.card);
                if (res.data.spawned) {
                  onChange(res.data.spawned);
                  toast(`Próxima repetição criada (#${res.data.spawned.number})`);
                }
                void refreshActivity();
              }}
              className={cn(
                "flex h-12 items-center justify-center gap-2.5 rounded-2xl text-[14px] font-semibold transition-colors",
                done ? "bg-success text-white" : "bg-panel text-panel-fg hover:bg-panel-2",
              )}
            >
              <RoundCheck checked={done} label={done ? "Reabrir" : "Concluir"} size={20} decorative />
              {done ? "Concluída" : "Marcar como concluída"}
            </button>

            <div className="grid gap-0.5 rounded-[20px] bg-surface-2 p-2">
              <ClientProp card={card} apply={applySummary} after={refreshActivity} />
              <Assignees card={card} patch={patch} apply={applySummary} after={refreshActivity} />
              <Labels card={card} patch={patch} apply={applySummary} />
              <PropRow icon={<Flag />} label="Prioridade">
                <PopoverButton
                  className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-surface"
                  button={card.priority ? <><PriorityIcon priority={card.priority} size={20} />{PRIORITY_META[card.priority as Priority].label}</> : <Empty>Definir</Empty>}
                >
                  {(close) => <PriorityList value={card.priority} onChange={(p) => { close(); void save({ priority: p }); }} />}
                </PopoverButton>
              </PropRow>
              <PropRow icon={<CalendarRange />} label="Início">
                <PopoverButton className="flex min-h-9 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-surface" button={card.startDate ? shortDay(card.startDate) : <Empty>Definir</Empty>}>
                  {(close) => <DateList value={card.startDate} onChange={(v) => { close(); void save({ startDate: v }); }} />}
                </PopoverButton>
              </PropRow>
              <PropRow icon={<CalendarDays />} label="Prazo">
                <PopoverButton
                  className="flex min-h-9 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-surface"
                  button={card.dueDate ? <span className={cn(!done && card.dueDate < new Date().toISOString().slice(0, 10) && "font-semibold text-danger")}>{shortDay(card.dueDate)}</span> : <Empty>Definir</Empty>}
                >
                  {(close) => <DateList value={card.dueDate} onChange={(v) => { close(); void save({ dueDate: v }); }} />}
                </PopoverButton>
              </PropRow>
              <PropRow icon={<Repeat />} label="Repetir">
                <PopoverButton className="flex min-h-9 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-surface" button={card.repeatEvery ? REPEAT_LABEL[card.repeatEvery as keyof typeof REPEAT_LABEL] : <Empty>Não repete</Empty>}>
                  {(close) => (
                    <div className="grid gap-0.5">
                      {REPEATS.map((r) => (
                        <MenuItem key={r} active={card.repeatEvery === r} onClick={() => { close(); void save({ repeatEvery: r }); }}>{REPEAT_LABEL[r]}</MenuItem>
                      ))}
                      <div className="my-1 h-px bg-border" />
                      <MenuItem onClick={() => { close(); void save({ repeatEvery: null }); }}>Não repetir</MenuItem>
                      <p className="px-2.5 pb-1 pt-2 text-xs text-fg-3">Ao concluir, a próxima nasce na primeira coluna com as datas avançadas.</p>
                    </div>
                  )}
                </PopoverButton>
              </PropRow>
              <PropRow icon={<Clock />} label="Estimativa">
                <PopoverButton className="flex min-h-9 w-full items-center rounded-xl px-2 text-left text-sm hover:bg-surface" button={card.estimatedMin ? formatMinutes(card.estimatedMin) : <Empty>Definir</Empty>}>
                  {(close) => (
                    <div className="grid gap-0.5">
                      {[15, 30, 60, 120, 240, 480].map((m) => (
                        <MenuItem key={m} active={card.estimatedMin === m} onClick={() => { close(); void save({ estimatedMin: m }); }}>{formatMinutes(m)}</MenuItem>
                      ))}
                      <div className="my-1 h-px bg-border" />
                      <MenuItem onClick={() => { close(); void save({ estimatedMin: null }); }}>Sem estimativa</MenuItem>
                    </div>
                  )}
                </PopoverButton>
              </PropRow>
              <PropRow icon={<Paintbrush />} label="Capa">
                <PopoverButton
                  className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-surface"
                  button={card.coverImageId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/anexos/${card.coverImageId}`} alt="" className="h-6 w-10 rounded-md object-cover" />
                  ) : card.coverColor ? <span className="h-5 w-10 rounded-full" style={{ background: card.coverColor }} /> : <Empty>Sem capa</Empty>}
                  width={260}
                >
                  {(close) => (
                    <div className="p-1.5">
                      <ColorGrid value={card.coverColor} allowNone onChange={(c) => { close(); void save({ coverColor: c, coverAttachmentId: null }); }} />
                      {card.attachments.some((a) => a.mime.startsWith("image/") && !a.mime.includes("photoshop") && !a.mime.includes("heic")) && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="px-1 pb-1.5 text-xs font-medium text-fg-3">Imagem dos anexos</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {card.attachments.filter((a) => a.mime.startsWith("image/") && !a.mime.includes("photoshop") && !a.mime.includes("heic")).slice(0, 12).map((a) => (
                              <button key={a.id} type="button" aria-label={`Usar ${a.name} como capa`} onClick={() => { close(); void save({ coverAttachmentId: card.coverImageId === a.id ? null : a.id }); }} className={cn("aspect-square overflow-hidden rounded-lg ring-offset-1 ring-offset-surface", card.coverImageId === a.id && "ring-2 ring-accent")}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/anexos/${a.id}`} alt="" loading="lazy" className="size-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </PopoverButton>
              </PropRow>
            </div>

            <TimerBox card={card} patch={patch} />

            <p className="px-2 text-xs text-fg-3">
              Criada {card.createdBy ? `por ${card.createdBy.name} ` : ""}{relativeTime(card.createdAt)}
            </p>
          </aside>
        </div>
      </div>

      {templateOpen && <SaveTemplateModal card={card} onClose={() => setTemplateOpen(false)} />}
      {moveOpen && (
        <MoveBoardModal
          card={card}
          onClose={() => setMoveOpen(false)}
          onMoved={(s, boardName, columnName) => {
            setMoveOpen(false);
            applySummary(s, { boardName, columnName });
            void load();
            toast(`Movida para ${boardName}`);
          }}
        />
      )}
    </Modal>
  );
}

// ---------- peças ----------

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-fg-3">{children}</span>;
}

function Section({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-panel text-panel-fg [&>svg]:size-4">{icon}</span>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] items-center gap-1">
      <span className="flex items-center gap-2 px-2 text-[13px] text-fg-2 [&>svg]:size-4 [&>svg]:text-fg-3">
        {icon}
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TitleEditor({ value, done, onSave }: { value: string; done: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [v]);
  const commit = () => {
    const t = v.trim();
    if (!t) return setV(value);
    if (t !== value) void onSave(t);
  };
  return (
    <textarea
      ref={ref}
      value={v}
      rows={1}
      maxLength={200}
      aria-label="Título da demanda"
      onChange={(e) => setV(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn("w-full resize-none overflow-hidden rounded-xl bg-transparent px-1 py-0.5 text-[24px] font-semibold leading-tight tracking-tight outline-none hover:bg-surface-2 focus:bg-surface-2", done && "text-fg-2")}
    />
  );
}

function DescriptionEditor({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return value ? (
      <div
        role="button"
        tabIndex={0}
        title="Clique para editar"
        onClick={(e) => !(e.target as HTMLElement).closest("a, input") && setEditing(true)}
        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setEditing(true)}
        className="cursor-text rounded-2xl bg-surface-2 px-4 py-3 transition-colors hover:bg-surface-3/60"
      >
        <RichContent html={value} />
      </div>
    ) : (
      <button type="button" onClick={() => setEditing(true)} className="rounded-2xl bg-surface-2 px-4 py-3 text-left text-sm text-fg-3 transition-colors hover:text-fg-2">
        Escreva o briefing, links de referência, o que precisa ser entregue... Dá para colar de documentos e sites com a formatação.
      </button>
    );
  }
  const commit = async () => {
    setSaving(true);
    const ok = await onSave(v || null);
    setSaving(false);
    if (ok) setEditing(false);
  };
  return (
    <div className="animate-pop grid gap-2">
      <RichEditor value={v} onChange={setV} autoFocus minHeight={160} placeholder="Briefing, referências, entregas..." onSubmit={commit} />
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-auto hidden text-xs text-fg-3 sm:inline">⌘ + Enter salva</span>
        <Button size="sm" variant="ghost" onClick={() => { setV(value ?? ""); setEditing(false); }}>Cancelar</Button>
        <Button size="sm" variant="primary" loading={saving} onClick={commit}>Salvar</Button>
      </div>
    </div>
  );
}

/** Atualiza a janela e avisa o quadro (fora do updater do React, que precisa ser puro). */
type Patch = (fn: (c: CardDetail) => CardDetail, notify?: boolean) => void;

/** Recalcula o resumo do checklist e avisa o quadro. */
function withChecklistCount(c: CardDetail): CardDetail {
  const items = c.checklists.flatMap((l) => l.items);
  return { ...c, checklist: { done: items.filter((i) => i.done).length, total: items.length } };
}

function Checklists({ card, patch }: { card: CardDetail; patch: Patch }) {
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("Checklist");

  const update = (fn: (c: CardDetail) => CardDetail) => patch((c) => withChecklistCount(fn(c)));

  return (
    <Section
      icon={<ListChecks />}
      title="Checklist"
      action={
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Nova lista
        </Button>
      }
    >
      {card.checklists.length === 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="rounded-2xl bg-surface-2 px-4 py-3 text-left text-sm text-fg-3 hover:text-fg-2">
          Quebre a demanda em passos para acompanhar o progresso.
        </button>
      )}
      {adding && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await addChecklist(card.id, title);
            if (!res.ok) return toast(res.error, "error");
            update((c) => ({ ...c, checklists: [...c.checklists, res.data] }));
            setAdding(false);
            setTitle("Checklist");
          }}
        >
          <input autoFocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          <Button type="submit" size="md" variant="primary">Criar</Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
        </form>
      )}
      {card.checklists.map((list) => (
        <ChecklistBlock key={list.id} list={list} update={update} />
      ))}
    </Section>
  );
}

function ChecklistBlock({ list, update }: { list: CardDetail["checklists"][number]; update: (fn: (c: CardDetail) => CardDetail) => void }) {
  const { toast, confirm } = useFeedback();
  const [text, setText] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const doneCount = list.items.filter((i) => i.done).length;
  const pct = list.items.length ? Math.round((doneCount / list.items.length) * 100) : 0;
  const patchList = (fn: (l: typeof list) => typeof list) => update((c) => ({ ...c, checklists: c.checklists.map((l) => (l.id === list.id ? fn(l) : l)) }));

  return (
    <div className="grid gap-2 rounded-[20px] bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <input
          defaultValue={list.title}
          maxLength={300}
          aria-label="Nome da lista"
          onBlur={async (e) => {
            const v = e.target.value.trim();
            if (!v || v === list.title) return;
            const res = await renameChecklist(list.id, v);
            if (!res.ok) toast(res.error, "error");
            else patchList((l) => ({ ...l, title: v }));
          }}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-sm font-semibold outline-none focus:bg-surface"
        />
        {doneCount > 0 && (
          <button type="button" onClick={() => setHideDone((v) => !v)} className="rounded-full px-2 py-1 text-xs text-fg-2 hover:bg-surface">
            {hideDone ? "Mostrar feitos" : "Esconder feitos"}
          </button>
        )}
        <button
          type="button"
          aria-label="Excluir lista"
          onClick={async () => {
            if (list.items.length && !(await confirm({ title: "Excluir lista?", text: `"${list.title}" e seus ${list.items.length} itens.`, confirm: "Excluir", danger: true }))) return;
            const res = await deleteChecklist(list.id);
            if (!res.ok) return toast(res.error, "error");
            update((c) => ({ ...c, checklists: c.checklists.filter((l) => l.id !== list.id) }));
          }}
          className="inline-flex size-7 items-center justify-center rounded-full text-fg-3 hover:bg-surface hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {list.items.length > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums text-fg-2">{pct}%</span>
        </div>
      )}
      <div className="grid gap-0.5">
        {list.items.filter((i) => !(hideDone && i.done)).map((item) => (
          <div key={item.id} className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-surface">
            <RoundCheck
              checked={item.done}
              label={item.text}
              size={19}
              onChange={async () => {
                const done = !item.done;
                patchList((l) => ({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
                const res = await updateChecklistItem(item.id, { done });
                if (!res.ok) {
                  toast(res.error, "error");
                  patchList((l) => ({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, done: !done } : i)) }));
                }
              }}
            />
            <input
              defaultValue={item.text}
              maxLength={300}
              aria-label="Item"
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (!v || v === item.text) return;
                const res = await updateChecklistItem(item.id, { text: v });
                if (!res.ok) toast(res.error, "error");
                else patchList((l) => ({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, text: v } : i)) }));
              }}
              className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", item.done && "text-fg-3 line-through")}
            />
            <button
              type="button"
              aria-label="Excluir item"
              onClick={async () => {
                const before = list.items;
                patchList((l) => ({ ...l, items: l.items.filter((i) => i.id !== item.id) }));
                const res = await deleteChecklistItem(item.id);
                if (!res.ok) {
                  toast(res.error, "error");
                  patchList((l) => ({ ...l, items: before }));
                }
              }}
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form
        className="flex items-center gap-2 px-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          setText("");
          const res = await addChecklistItem(list.id, v);
          if (!res.ok) return toast(res.error, "error");
          patchList((l) => ({ ...l, items: [...l.items, res.data] }));
        }}
      >
        <Plus className="size-4 text-fg-3" />
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Adicionar item e apertar Enter" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3" />
      </form>
    </div>
  );
}

function Attachments({ card, patch, onPick }: { card: CardDetail; patch: Patch; onPick: () => void }) {
  const { toast, confirm } = useFeedback();
  const { me } = useLookups();
  if (card.attachments.length === 0) {
    return (
      <button type="button" onClick={onPick} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left text-sm text-fg-3 hover:text-fg-2">
        <Upload className="size-4" /> Arraste arquivos aqui ou clique para enviar (até 25 MB)
      </button>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {card.attachments.map((a) => {
        const isImage = a.mime.startsWith("image/") && !a.mime.includes("photoshop") && !a.mime.includes("heic");
        return (
          <div key={a.id} className="group flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
            <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel text-panel-fg">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/anexos/${a.id}`} alt="" className="size-full object-cover" loading="lazy" />
              ) : a.mime.startsWith("image/") ? (
                <ImageIcon className="size-5" />
              ) : (
                <FileText className="size-5" />
              )}
            </a>
            <div className="min-w-0 flex-1">
              <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">{a.name}</a>
              <p className="truncate text-xs text-fg-3">{formatBytes(a.size)} · {relativeTime(a.createdAt)}{a.uploadedBy ? ` · ${a.uploadedBy.split(" ")[0]}` : ""}</p>
              <a href={`/api/anexos/${a.id}?baixar=1`} className="text-xs font-medium text-accent-strong hover:underline">Baixar</a>
            </div>
            {(me.isAdmin || a.uploadedBy === me.name) && (
              <button
                type="button"
                aria-label="Excluir anexo"
                onClick={async () => {
                  if (!(await confirm({ title: "Excluir anexo?", text: a.name, confirm: "Excluir", danger: true }))) return;
                  const res = await deleteAttachment(a.id);
                  if (!res.ok) return toast(res.error, "error");
                  patch((c) => ({ ...c, attachments: c.attachments.filter((x) => x.id !== a.id), attachmentCount: Math.max(0, c.attachmentCount - 1) }));
                }}
                className="inline-flex size-8 items-center justify-center rounded-full text-fg-3 opacity-0 hover:bg-surface hover:text-danger group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Conversation({ card, patch }: { card: CardDetail; patch: Patch }) {
  const { toast, confirm } = useFeedback();
  const { users, me } = useLookups();
  const [tab, setTab] = useState<"comentarios" | "historico">("comentarios");
  const [body, setBody] = useState("");
  const [composerKey, setComposerKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  const sendingRef = useRef(false);
  const send = async () => {
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const res = await addComment(card.id, body);
    sendingRef.current = false;
    setSending(false);
    if (!res.ok) return toast(res.error, "error");
    setBody("");
    setComposerKey((k) => k + 1); // limpa o editor
    patch((c) => ({ ...c, comments: [res.data, ...c.comments], commentCount: c.commentCount + 1 }));
  };

  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-panel text-panel-fg">
          {tab === "comentarios" ? <MessageCircle className="size-4" /> : <History className="size-4" />}
        </span>
        <div className="flex rounded-full bg-surface-2 p-1">
          {([
            ["comentarios", `Comentários${card.comments.length ? ` ${card.comments.length}` : ""}`],
            ["historico", "Histórico"],
          ] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={cn("h-8 rounded-full px-3.5 text-[13px] font-medium", tab === v ? "bg-surface text-fg shadow-sm" : "text-fg-2")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "comentarios" ? (
        <>
          <div className="flex gap-3">
            <Avatar user={me} size={34} />
            <div className="relative grid min-w-0 flex-1 gap-2">
              <RichEditor
                key={composerKey}
                value=""
                onChange={setBody}
                variant="compact"
                minHeight={56}
                mentionUsers={users}
                onSubmit={send}
                placeholder="Escreva um comentário. Use @ para chamar alguém."
              />
              {body && (
                <div className="animate-pop flex items-center justify-end gap-2">
                  <span className="hidden text-xs text-fg-3 sm:inline">⌘ + Enter envia</span>
                  <Button size="sm" variant="primary" loading={sending} onClick={send}>Comentar</Button>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-4">
            {card.comments.map((c) => (
              <div key={c.id} className="group flex gap-3">
                <Avatar user={c.user} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{c.user.name}</span>{" "}
                    <span className="text-xs text-fg-3">{relativeTime(c.createdAt)}{c.editedAt ? " (editado)" : ""}</span>
                  </p>
                  {editing?.id === c.id ? (
                    <div className="mt-1 grid gap-2">
                      <RichEditor value={editing.body} onChange={(html) => setEditing({ id: c.id, body: html })} variant="compact" autoFocus minHeight={56} mentionUsers={users} />
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={async () => {
                            const res = await editComment(c.id, editing.body);
                            if (!res.ok) return toast(res.error, "error");
                            patch((x) => ({ ...x, comments: x.comments.map((m) => (m.id === c.id ? { ...m, ...res.data } : m)) }), false);
                            setEditing(null);
                          }}
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <RichContent html={c.body} className="mt-1 rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5" />
                  )}
                  {editing?.id !== c.id && (c.user.id === me.id || me.isAdmin) && (
                    <div className="mt-1 flex gap-3 pl-1 text-xs text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {c.user.id === me.id && <button type="button" onClick={() => setEditing({ id: c.id, body: c.body })} className="hover:text-fg">Editar</button>}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await confirm({ title: "Excluir comentário?", confirm: "Excluir", danger: true }))) return;
                          const res = await deleteComment(c.id);
                          if (!res.ok) return toast(res.error, "error");
                          patch((x) => ({ ...x, comments: x.comments.filter((m) => m.id !== c.id), commentCount: Math.max(0, x.commentCount - 1) }));
                        }}
                        className="hover:text-danger"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <ol className="grid gap-3">
          {card.activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              {a.user ? <Avatar user={a.user} size={26} /> : <span className="size-[26px] rounded-full bg-surface-3" />}
              <p className="min-w-0 flex-1 pt-0.5 text-fg-2">
                <span className="font-medium text-fg">{a.user?.name ?? a.data.by ?? "Sistema"}</span> {ACTIVITY_TEXT[a.type]?.(a.data) ?? a.type}
                <span className="ml-1.5 text-xs text-fg-3">{relativeTime(a.createdAt)}</span>
              </p>
            </li>
          ))}
          {card.activities.length === 0 && <p className="text-sm text-fg-3">Sem histórico ainda.</p>}
        </ol>
      )}
    </section>
  );
}

function ClientProp({ card, apply, after }: { card: CardDetail; apply: (s: CardSummary) => void; after: () => void }) {
  const { toast } = useFeedback();
  const { clientById } = useLookups();
  const client = card.clientId ? clientById.get(card.clientId) : undefined;
  return (
    <PropRow icon={<Building2 />} label="Cliente">
      <PopoverButton
        className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-surface"
        width={280}
        button={client ? <><ClientDot color={client.color} /><span className="truncate">{client.name}</span></> : <Empty>Definir</Empty>}
      >
        {(close) => (
          <ClientList
            value={card.clientId}
            onChange={async (id) => {
              close();
              const res = await setClient(card.id, id);
              if (!res.ok) return toast(res.error, "error");
              apply(res.data);
              after();
            }}
          />
        )}
      </PopoverButton>
    </PropRow>
  );
}

/**
 * Lista sincronizada com o servidor sem corrida: cliques rápidos atualizam a tela na hora; ao servidor vai sempre
 * a lista mais recente, uma chamada por vez. Se o servidor recusar, a tela volta ao último estado confirmado.
 */
function useListSync(
  current: string[],
  field: "assigneeIds" | "labelIds",
  send: (ids: string[]) => Promise<{ ok: true; data: CardSummary } | { ok: false; error: string }>,
  patch: Patch,
  apply: (s: CardSummary) => void,
  after?: () => void,
) {
  const { toast } = useFeedback();
  const desired = useRef(current);
  const confirmed = useRef(current);
  const inflight = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    // mudança vinda de fora (ao vivo) quando não há envio pendente
    if (!inflight.current) desired.current = confirmed.current = current;
  }, [current]);

  const flush = async () => {
    if (inflight.current) {
      dirty.current = true;
      return;
    }
    inflight.current = true;
    try {
      do {
        dirty.current = false;
        const res = await send(desired.current);
        if (!res.ok) {
          toast(res.error, "error");
          desired.current = confirmed.current;
          patch((c) => ({ ...c, [field]: confirmed.current }));
          dirty.current = false;
          break;
        }
        confirmed.current = res.data[field];
        if (!dirty.current) apply(res.data);
      } while (dirty.current);
    } finally {
      inflight.current = false;
    }
    after?.();
  };

  return (id: string) => {
    const base = desired.current;
    desired.current = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    patch((c) => ({ ...c, [field]: desired.current }));
    void flush();
  };
}

function Assignees({ card, patch, apply, after }: { card: CardDetail; patch: Patch; apply: (s: CardSummary) => void; after: () => void }) {
  const { userById } = useLookups();
  const users = card.assigneeIds.map((id) => userById.get(id)).filter((u): u is UserLite => Boolean(u));
  const toggle = useListSync(card.assigneeIds, "assigneeIds", (ids) => setAssignees(card.id, ids), patch, apply, after);
  return (
    <PropRow icon={<Users />} label="Pessoas">
      <PopoverButton
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-xl px-1.5 py-1 text-left text-sm hover:bg-surface"
        button={users.length ? users.map((u) => <Avatar key={u.id} user={u} size={26} />) : <Empty>Atribuir</Empty>}
      >
        {() => <AssigneeList selected={card.assigneeIds} onToggle={toggle} />}
      </PopoverButton>
    </PropRow>
  );
}

function Labels({ card, patch, apply }: { card: CardDetail; patch: Patch; apply: (s: CardSummary) => void }) {
  const { labelById } = useLookups();
  const labels = card.labelIds.map((id) => labelById.get(id)).filter(Boolean);
  const toggle = useListSync(card.labelIds, "labelIds", (ids) => setLabels(card.id, ids), patch, apply);
  return (
    <PropRow icon={<Tag />} label="Etiquetas">
      <PopoverButton
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-xl px-1.5 py-1 text-left text-sm hover:bg-surface"
        button={labels.length ? labels.map((l) => <LabelChip key={l!.id} name={l!.name} color={l!.color} size="xs" />) : <Empty>Adicionar</Empty>}
      >
        {() => <LabelList selected={card.labelIds} onToggle={toggle} />}
      </PopoverButton>
    </PropRow>
  );
}

function TimerBox({ card, patch }: { card: CardDetail; patch: Patch }) {
  const { toast } = useFeedback();
  const [now, setNow] = useState(() => Date.now());
  const running = card.myTimerStartedAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const liveSec = running ? Math.max(0, Math.floor((now - new Date(running).getTime()) / 1000)) : 0;
  const clock = `${String(Math.floor(liveSec / 3600)).padStart(2, "0")}:${String(Math.floor((liveSec % 3600) / 60)).padStart(2, "0")}:${String(liveSec % 60).padStart(2, "0")}`;
  const est = card.estimatedMin;
  const spent = card.timeSpentMin;
  return (
    <div className="grid gap-2 rounded-[20px] bg-surface-2 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={running ? "Pausar cronômetro" : "Iniciar cronômetro"}
          onClick={async () => {
            if (running) {
              const res = await stopTimer(card.id);
              if (!res.ok) return toast(res.error, "error");
              const fresh = await getCardDetail(card.id);
              if (fresh.ok) patch(() => fresh.data);
            } else {
              const res = await startTimer(card.id);
              if (!res.ok) return toast(res.error, "error");
              patch((c) => ({ ...c, myTimerStartedAt: res.data, timerRunning: true }));
              setNow(Date.now());
            }
          }}
          className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors", running ? "bg-accent text-accent-ink" : "bg-panel text-panel-fg hover:bg-panel-2")}
        >
          {running ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4 translate-x-px" fill="currentColor" />}
        </button>
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold tabular-nums">{running ? clock : formatMinutes(spent)}</p>
          <p className="text-xs text-fg-3">{running ? "Cronômetro rodando" : spent ? "Tempo gasto no total" : "Cronometrar o trabalho"}</p>
        </div>
      </div>
      {est ? (
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", spent > est ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100, Math.round((spent / est) * 100))}%` }} />
          </div>
          <span className="text-xs tabular-nums text-fg-2">{formatMinutes(spent)} de {formatMinutes(est)}</span>
        </div>
      ) : null}
    </div>
  );
}

function CardMenu({ onDuplicate, onMove, onCopyLink, onArchive, onDelete, onTemplate }: { onDuplicate: () => void; onMove: () => void; onCopyLink: () => void; onArchive: () => void; onDelete: () => void; onTemplate: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <button ref={ref} type="button" aria-label="Ações da demanda" onClick={() => setOpen((v) => !v)} className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
        <MoreHorizontal className="size-5" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={230} align="end">
        <MenuItem icon={<Copy />} onClick={run(onDuplicate)}>Duplicar</MenuItem>
        <MenuItem icon={<ArrowRightLeft />} onClick={run(onMove)}>Mover para outro quadro</MenuItem>
        <MenuItem icon={<Link2 />} onClick={run(onCopyLink)}>Copiar link</MenuItem>
        <MenuItem icon={<LayoutTemplate />} onClick={run(onTemplate)}>Salvar como modelo</MenuItem>
        <MenuItem icon={<Archive />} onClick={run(onArchive)}>Arquivar</MenuItem>
        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<Trash2 />} danger onClick={run(onDelete)}>Excluir</MenuItem>
      </Popover>
    </>
  );
}

function MoveBoardModal({ card, onClose, onMoved }: { card: CardDetail; onClose: () => void; onMoved: (s: CardSummary, boardName: string, columnName: string) => void }) {
  const { toast } = useFeedback();
  const [boards, setBoards] = useState<{ id: string; name: string; color: string; columns: { id: string; name: string }[] }[] | null>(null);
  const [boardId, setBoardId] = useState(card.boardId);
  const [columnId, setColumnId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listBoardsForMove().then((res) => {
      if (!res.ok) return toast(res.error, "error");
      setBoards(res.data);
      setColumnId(res.data.find((b) => b.id === card.boardId)?.columns.find((c) => c.id === card.columnId)?.id ?? "");
    });
  }, [toast, card.boardId, card.columnId]);

  const board = boards?.find((b) => b.id === boardId);
  const pickBoard = (id: string) => {
    setBoardId(id);
    const b = boards?.find((x) => x.id === id);
    setColumnId(b?.columns.find((c) => c.id === card.columnId)?.id ?? b?.columns[0]?.id ?? "");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Mover para outro quadro"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!columnId}
            onClick={async () => {
              setSaving(true);
              const res = await moveCardToBoard(card.id, boardId, columnId);
              setSaving(false);
              if (!res.ok) return toast(res.error, "error");
              onMoved(res.data.card, board?.name ?? "", board?.columns.find((c) => c.id === columnId)?.name ?? "");
            }}
          >
            Mover
          </Button>
        </>
      }
    >
      {!boards ? (
        <p className="py-4 text-sm text-fg-3">Carregando quadros...</p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">Quadro</span>
            <div className="grid max-h-56 gap-1 overflow-y-auto scroll-thin">
              {boards.map((b) => (
                <button key={b.id} type="button" onClick={() => pickBoard(b.id)} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm", boardId === b.id ? "bg-panel text-panel-fg" : "bg-surface-2 hover:bg-surface-3")}>
                  <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          {board && (
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-fg-2">Coluna</span>
              <div className="flex flex-wrap gap-1.5">
                {board.columns.map((c) => (
                  <button key={c.id} type="button" onClick={() => setColumnId(c.id)} className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium", columnId === c.id ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2")}>
                    {c.name}
                  </button>
                ))}
                {board.columns.length === 0 && <p className="text-sm text-fg-3">Esse quadro não tem colunas.</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function SaveTemplateModal({ card, onClose }: { card: CardDetail; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(card.title.slice(0, 60));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = await templateFromCard(card.id, name);
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Modelo salvo. Use em Nova demanda.");
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Salvar como modelo"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save}>Salvar modelo</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-fg-2">Guarda título, texto, prioridade, estimativa, etiquetas e os itens do checklist (todos desmarcados) para criar demandas iguais depois.</p>
        <Field label="Nome do modelo">
          <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
      </div>
    </Modal>
  );
}

function CloseButton({ fallback }: { fallback: () => void }) {
  const close = useModalClose() ?? fallback;
  return (
    <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
      <X className="size-5" />
    </button>
  );
}
