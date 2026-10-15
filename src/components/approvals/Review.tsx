"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Loader2, MessageSquareWarning, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { APPROVAL_FORMAT_LABEL } from "@/lib/domain";
import { relativeTime } from "@/lib/dates";
import type { PortalPost } from "@/lib/types";
import { Input, Textarea } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { decideApproval, sendClientMessage } from "@/app/actions/approval-public";
import { ClientMark, MediaView, StatusChip, TextOnly, whenLabel } from "./ui";
import { targetsLabel } from "./targets";

export const NAME_KEY = "dmanda:nome-aprovador";
export function readName() {
  try {
    return typeof window === "undefined" ? "" : localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
    window.dispatchEvent(new Event("dmanda:nome"));
  } catch {}
}

/** Revisão de um post: arte à esquerda, legenda, conversa e decisão à direita. */
export function Review({
  token,
  post,
  client,
  name,
  onName,
  nav,
  onClose,
}: {
  token: string;
  post: PortalPost;
  client: { name: string; color: string; imageUrl: string | null };
  name: string;
  onName: (n: string) => void;
  nav?: { index: number; total: number; prev?: () => void; next?: () => void };
  onClose?: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [mode, setMode] = useState<null | "APPROVED" | "CHANGES">(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [typed, setTyped] = useState(name);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = useRef<HTMLDivElement>(null);
  const base = `/api/aprovar/${token}`;

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [post.messages.length]);

  const who = (typed || name).trim();
  const needName = who.length < 2;

  const decide = async () => {
    if (!mode || busy) return;
    if (needName) return toast("Escreva o seu nome.", "error");
    if (mode === "CHANGES" && !comment.trim()) return toast("Conte o que precisa mudar.", "error");
    setBusy(true);
    const res = await decideApproval(token, post.id, { decision: mode, name: who, comment: comment.trim() || null, targets: mode === "CHANGES" ? targets : [] });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    if (who !== name) {
      saveName(who);
      onName(who);
    }
    toast(mode === "APPROVED" ? "Post aprovado. Obrigado!" : "Pedido de ajuste enviado para a equipe");
    setMode(null);
    setComment("");
    setTargets([]);
    router.refresh();
    if (mode === "APPROVED" && nav?.next) nav.next();
  };

  const sendMsg = async () => {
    if (!msg.trim() || busy) return;
    if (needName) return toast("Escreva o seu nome antes de mandar mensagem.", "error");
    setBusy(true);
    const res = await sendClientMessage(token, post.id, { name: who, body: msg });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    if (who !== name) {
      saveName(who);
      onName(who);
    }
    setMsg("");
    router.refresh();
  };

  const toggle = (t: string) => setTargets((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const handle = `@${client.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")}`;

  return (
    <div className="grid min-h-0 md:h-full md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center justify-center bg-surface-2 p-5 md:p-8">
        {post.format === "TEXTO" || post.media.length === 0 ? <TextOnly text={post.caption ?? ""} /> : <MediaView base={base} media={post.media} format={post.format} className="max-w-[420px]" />}
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="grid gap-3 px-5 pt-5 md:px-6">
          {(nav || onClose) && (
            <div className="flex items-center gap-2">
              {nav && <span className="text-xs font-medium text-fg-3">Post {nav.index + 1} de {nav.total}</span>}
              <div className="ml-auto flex gap-1.5">
                {nav && (
                  <>
                    <button type="button" aria-label="Post anterior" disabled={!nav.prev} onClick={nav.prev} className="inline-flex size-9 items-center justify-center rounded-full bg-surface-2 hover:bg-surface-3 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
                    <button type="button" aria-label="Próximo post" disabled={!nav.next} onClick={nav.next} className="inline-flex size-9 items-center justify-center rounded-full bg-surface-2 hover:bg-surface-3 disabled:opacity-40"><ChevronRight className="size-4" /></button>
                  </>
                )}
                {onClose && <button type="button" aria-label="Fechar" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-full bg-panel text-panel-fg"><X className="size-4" /></button>}
              </div>
            </div>
          )}
          <h2 className="text-balance text-2xl font-semibold leading-tight">{post.title}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={post.status} />
            <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2">{APPROVAL_FORMAT_LABEL[post.format]}</span>
            {post.round > 1 && <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2">versão {post.round}</span>}
          </div>
          {post.publishAt && <p className="flex items-center gap-1.5 text-sm text-fg-2"><CalendarClock className="size-4" /> Vai ao ar {whenLabel(post.publishAt)}</p>}
        </div>

        <div ref={chat} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
          <div className="grid gap-4">
            {post.note && <p className="rounded-2xl bg-accent/12 px-3.5 py-2.5 text-sm"><b>Recado da equipe:</b> {post.note}</p>}
            {post.caption && post.format !== "TEXTO" && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Legenda</p>
                <div className="rounded-2xl bg-surface-2 p-3.5">
                  <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><ClientMark client={client} size={22} round /> {handle}</p>
                  <p className="prose-lite whitespace-pre-wrap text-sm leading-relaxed">{post.caption}</p>
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Conversa com a equipe</p>
              {post.messages.length === 0 ? (
                <p className="py-3 text-center text-xs text-fg-3">Ficou alguma dúvida? Escreva para a equipe.</p>
              ) : (
                <div className="grid gap-2">
                  {post.messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.author === "CLIENT" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-[18px] px-3.5 py-2 text-sm", m.author === "CLIENT" ? "rounded-br-md bg-panel text-panel-fg" : "rounded-bl-md bg-surface-2")}>
                        <p className={cn("text-[11px] font-semibold", m.author === "CLIENT" ? "text-panel-fg-2" : "text-fg-3")}>{m.author === "CLIENT" ? m.name : `${m.name} · equipe`} · {relativeTime(m.createdAt)}</p>
                        <p className="prose-lite whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-end gap-2">
                <Textarea rows={2} value={msg} maxLength={1500} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva para a equipe" aria-label="Mensagem para a equipe" className="min-h-12 resize-none" />
                <button type="button" aria-label="Enviar mensagem" onClick={sendMsg} disabled={!msg.trim() || busy} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-panel text-panel-fg disabled:opacity-35">
                  {busy && !mode ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 md:px-6">
          {post.status !== "PENDING" ? (
            <div className={cn("rounded-2xl px-4 py-3 text-sm", post.status === "CHANGES" ? "bg-danger/10" : "bg-success/12")}>
              <p className="font-semibold">
                {post.status === "CHANGES" ? `Ajuste pedido${post.changeTargets.length ? ` em ${targetsLabel(post.changeTargets)}` : ""}` : post.status === "PUBLISHED" ? "Aprovado e publicado" : "Aprovado"}
                {post.decidedBy ? ` por ${post.decidedBy}` : ""}{post.decidedAt ? `, ${relativeTime(post.decidedAt)}` : ""}
              </p>
              {post.clientComment && <p className="prose-lite mt-1 text-fg-2">“{post.clientComment}”</p>}
              {post.status === "CHANGES" && <p className="mt-1 text-xs text-fg-3">A equipe vai mandar uma nova versão aqui mesmo.</p>}
            </div>
          ) : mode ? (
            <div className="grid gap-3">
              {mode === "CHANGES" && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-xs font-medium text-fg-3">O que mudar?</span>
                    {[...post.media.map((_, i) => String(i + 1)), ...(post.caption ? ["legenda"] : [])].map((t) => (
                      <button key={t} type="button" aria-pressed={targets.includes(t)} onClick={() => toggle(t)} className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors", targets.includes(t) ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2 hover:text-fg")}>
                        {targets.includes(t) && <Check className="size-3.5" strokeWidth={3} />} {t === "legenda" ? "Legenda" : post.media.length === 1 ? "Arte" : `Arte ${t}`}
                      </button>
                    ))}
                  </div>
                  <Textarea autoFocus rows={3} value={comment} maxLength={1500} onChange={(e) => setComment(e.target.value)} placeholder="Conte o que precisa mudar" aria-label="O que precisa mudar" />
                </>
              )}
              {needName || (typed && typed !== name) ? <Input value={typed} maxLength={60} onChange={(e) => setTyped(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" /> : null}
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode(null)} disabled={busy} className="h-12 rounded-full px-5 text-sm font-medium text-fg-2 hover:bg-surface-2">Voltar</button>
                <button type="button" onClick={decide} disabled={busy} className={cn("inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-60", mode === "APPROVED" ? "bg-brand text-brand-ink" : "bg-panel text-panel-fg")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "APPROVED" ? <Check className="size-4" strokeWidth={3} /> : <SendHorizontal className="size-4" />}
                  {mode === "APPROVED" ? `Confirmar aprovação${who.length >= 2 ? ` como ${who.split(" ")[0]}` : ""}` : "Enviar pedido de ajuste"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setMode("APPROVED")} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-brand-ink hover:opacity-90"><Check className="size-4" strokeWidth={3} /> Aprovar</button>
              <button type="button" onClick={() => setMode("CHANGES")} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border-strong bg-surface text-sm font-semibold hover:bg-surface-2"><MessageSquareWarning className="size-4" /> Pedir ajuste</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
