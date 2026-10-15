"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, ImagePlus, Loader2, Paperclip, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { APPROVAL_FORMATS } from "@/lib/domain";
import type { ApprovalFormat, ApprovalPostView, CardSummary } from "@/lib/types";
import { Button, Field, Input, Textarea } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { createApproval, sendNewVersion } from "@/app/actions/approvals";
import { FORMAT_ICON, Thumb } from "./ui";
import { targetsLabel } from "./targets";

export type ComposerCard = { id: string; title: string; clientId: string | null; clientName: string | null; attachments: { id: string; name: string; mime: string; createdAt: string }[] };
type Item = { kind: "file" | "attachment"; id: string; name: string; video: boolean };
type Uploading = { key: string; name: string };

const FILE_BASE = "/api/aprovacoes/arquivo";
const ATT_BASE = "/api/anexos";
const isMedia = (mime: string) => (mime.startsWith("image/") && !mime.includes("photoshop") && !mime.includes("heic")) || mime.startsWith("video/");
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const select = "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-[var(--focus)]";

export function Composer({
  post,
  card,
  clients = [],
  boards = [],
  onClose,
  onDone,
}: {
  /** Nova versão deste post */
  post?: ApprovalPostView;
  /** Primeira aprovação de uma demanda */
  card?: ComposerCard;
  /** Aprovação avulsa: clientes e quadros para escolher */
  clients?: { id: string; name: string }[];
  boards?: { id: string; name: string }[];
  onClose: () => void;
  onDone: (r: { postId: string; token?: string; card: CardSummary | null }) => void;
}) {
  const { toast } = useFeedback();
  const last = post?.rounds[0] ?? null;
  const cardFiles = (card?.attachments ?? []).filter((a) => isMedia(a.mime)).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const [clientId, setClientId] = useState(card?.clientId ?? "");
  const [boardId, setBoardId] = useState("");
  const [title, setTitle] = useState(post?.title ?? card?.title ?? "");
  const [format, setFormat] = useState<ApprovalFormat>(post?.format ?? (cardFiles.length > 1 ? "CARROSSEL" : "IMAGEM"));
  const [items, setItems] = useState<Item[]>(() =>
    last ? last.media.map((m) => ({ kind: "file", id: m.id, name: m.name, video: m.video })) : cardFiles.slice(0, 10).map((a) => ({ kind: "attachment", id: a.id, name: a.name, video: a.mime.startsWith("video/") })),
  );
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [caption, setCaption] = useState(last?.caption ?? "");
  const [note, setNote] = useState("");
  const [publishAt, setPublishAt] = useState(toLocalInput(post?.publishAt ?? null));
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const standalone = !post && !card;

  const upload = async (files: FileList | File[]) => {
    const list = [...files].slice(0, 20 - items.length);
    let added = 0;
    for (const file of list) {
      const key = `${file.name}-${Math.random()}`;
      setUploading((u) => [...u, { key, name: file.name }]);
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/aprovacoes/arquivo", { method: "POST", body }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      setUploading((u) => u.filter((x) => x.key !== key));
      if (!res?.ok || !data?.id) {
        toast(data?.error ?? `Não deu para enviar ${file.name}.`, "error");
        continue;
      }
      added++;
      setItems((cur) => [...cur, { kind: "file", id: data.id, name: data.name, video: data.video }]);
      // mais de uma arte num post comum vira carrossel
      if (items.length + added > 1) setFormat((f) => (f === "IMAGEM" ? "CARROSSEL" : f));
    }
  };

  const move = (i: number, d: -1 | 1) =>
    setItems((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    if (saving || uploading.length) return;
    setSaving(true);
    const payload = {
      format,
      caption: caption.trim() || null,
      note: note.trim() || null,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      items: format === "TEXTO" ? [] : items.map(({ kind, id }) => ({ kind, id })),
    };
    const res = post
      ? await sendNewVersion(post.id, { ...payload, title: title.trim() })
      : await createApproval({ ...payload, title: title.trim(), cardId: card?.id ?? null, clientId: clientId || null, boardId: standalone && boardId ? boardId : null });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast(post ? "Nova versão enviada ao cliente" : "Pronto: o cliente já pode aprovar");
    const data = res.data as { postId?: string; token?: string; card: CardSummary | null };
    onDone({ postId: post?.id ?? data.postId!, token: data.token, card: data.card });
  };

  const notPicked = cardFiles.filter((a) => !items.some((i) => i.kind === "attachment" && i.id === a.id));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={post ? `Nova versão · ${post.title}` : "Nova aprovação"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={uploading.length > 0} onClick={submit}><Send className="size-4" /> {post ? "Enviar nova versão" : "Enviar ao cliente"}</Button>
        </>
      }
    >
      <div className="grid gap-5">
        {last?.status === "CHANGES" && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm">
            <p className="font-semibold">{last.decidedBy ?? "O cliente"} pediu ajuste{last.changeTargets.length ? ` em ${targetsLabel(last.changeTargets)}` : ""}</p>
            {last.clientComment && <p className="prose-lite mt-1 text-fg-2">“{last.clientComment}”</p>}
          </div>
        )}

        {!post && (
          <div className="grid gap-4 sm:grid-cols-2">
            {card ? (
              <Field label="Cliente">
                <p className={cn("flex h-10 items-center rounded-xl px-3 text-sm", card.clientId ? "bg-surface-2" : "bg-danger/10")}>{card.clientName ?? "Ligue a demanda a um cliente antes de enviar."}</p>
              </Field>
            ) : (
              <Field label="Cliente que vai aprovar">
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={select}>
                  <option value="">Escolha o cliente</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {standalone ? (
              <Field label="Criar demanda no quadro (opcional)">
                <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className={select}>
                  <option value="">Não criar demanda</option>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        )}

        <Field label="Título do post">
          <Input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Lançamento da coleção de verão" />
        </Field>

        <Field group label="Formato">
          <div className="flex flex-wrap gap-2">
            {APPROVAL_FORMATS.map(([v, label]) => {
              const Icon = FORMAT_ICON[v];
              return (
                <button key={v} type="button" onClick={() => setFormat(v)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors", format === v ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2 hover:text-fg")}>
                  <Icon className="size-3.5" /> {label}
                </button>
              );
            })}
          </div>
        </Field>

        {format !== "TEXTO" && (
          <Field group label={`Artes e vídeos${items.length ? `, ${items.length} na ordem do post` : ""}`}>
            <div className="grid gap-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
                }}
                className={cn("grid grid-cols-3 gap-2.5 rounded-[22px] p-2.5 transition-colors sm:grid-cols-4", drag ? "bg-accent/15" : "bg-surface-2")}
              >
                {items.map((it, i) => (
                  <div key={`${it.kind}-${it.id}`} className="group relative aspect-square">
                    <Thumb base={it.kind === "file" ? FILE_BASE : ATT_BASE} media={{ id: it.id, name: it.name, video: it.video }} className="size-full rounded-2xl" />
                    <span className="absolute left-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-panel text-xs font-bold text-panel-fg">{i + 1}</span>
                    <button type="button" aria-label={`Tirar ${it.name}`} onClick={() => setItems((c) => c.filter((x) => x !== it))} className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-white/95 text-black shadow">
                      <X className="size-3.5" />
                    </button>
                    {items.length > 1 && (
                      <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                        <button type="button" aria-label="Mover para antes" disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-black shadow disabled:opacity-0"><ArrowLeft className="size-3.5" /></button>
                        <button type="button" aria-label="Mover para depois" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-black shadow disabled:opacity-0"><ArrowRight className="size-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
                {uploading.map((u) => (
                  <div key={u.key} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface p-2 text-center text-[11px] text-fg-3">
                    <Loader2 className="size-5 animate-spin text-accent" />
                    <span className="line-clamp-2 break-all">{u.name}</span>
                  </div>
                ))}
                {items.length + uploading.length < 20 && (
                  <button type="button" onClick={() => input.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface text-[12.5px] font-medium text-fg-2 transition-colors hover:text-fg">
                    <ImagePlus className="size-6 text-accent-strong" />
                    Enviar artes
                    <span className="text-[11px] font-normal text-fg-3">ou arraste aqui</span>
                  </button>
                )}
              </div>
              <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => {
                if (e.target.files?.length) upload(e.target.files);
                e.target.value = "";
              }} />
              {notPicked.length > 0 && (
                <div className="grid gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-fg-3"><Paperclip className="size-3.5" /> Anexos da demanda: toque para colocar no post</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {notPicked.map((a) => (
                      <button key={a.id} type="button" aria-label={`Colocar ${a.name}`} onClick={() => setItems((c) => [...c, { kind: "attachment", id: a.id, name: a.name, video: a.mime.startsWith("video/") }])} className="shrink-0 opacity-70 transition-opacity hover:opacity-100">
                        <Thumb base={ATT_BASE} media={{ id: a.id, name: a.name, video: a.mime.startsWith("video/") }} className="size-16 rounded-xl" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Field>
        )}

        <Field label={format === "TEXTO" ? "Texto para aprovar" : "Legenda"}>
          <Textarea rows={5} value={caption} maxLength={4000} onChange={(e) => setCaption(e.target.value)} placeholder={format === "TEXTO" ? "O texto que o cliente vai aprovar" : "Legenda, hashtags e chamada"} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <Field label="Recado para o cliente (opcional)">
            <Textarea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: troquei a cor do fundo como você pediu" />
          </Field>
          <Field label="Vai ao ar em (opcional)">
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
              <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="pl-9" />
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export { targetsLabel } from "./targets";
