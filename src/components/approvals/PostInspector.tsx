"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, CalendarClock, Copy, SendHorizontal, ExternalLink, Loader2, MessageCircle, MoreHorizontal, RefreshCw, Send, SquareKanban, Undo2, Upload, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { APPROVAL_FORMAT_LABEL } from "@/lib/domain";
import { relativeTime } from "@/lib/dates";
import type { ApprovalPostView } from "@/lib/types";
import { Button, IconButton, Textarea } from "@/components/ui/basics";
import { MenuItem, Modal, Popover, useFeedback } from "@/components/ui/overlay";
import { archiveApproval, getApprovalPost, regeneratePostLink, sendTeamMessage, setApprovalPublished } from "@/app/actions/approvals";
import { ClientMark, MediaView, StatusChip, TextOnly, Thumb, whenLabel } from "./ui";
import { Composer } from "./Composer";
import { targetsLabel } from "./targets";

const FILE_BASE = "/api/aprovacoes/arquivo";

export function postLink(token: string) {
  return `${window.location.origin}/aprovar/p/${token}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function whatsappShare(post: { title: string; token: string }) {
  const text = `Oi! O post "${post.title}" está pronto para você aprovar: ${postLink(post.token)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

type Event = { key: string; at: string; side: "TEAM" | "CLIENT" | "SYSTEM"; who: string; body: React.ReactNode; tone?: "ok" | "warn" };

function timeline(p: ApprovalPostView): Event[] {
  const ev: Event[] = [];
  for (const r of p.rounds) {
    if (r.status === "CANCELED" && !r.decidedAt && r !== p.rounds[0]) {
      ev.push({ key: `s${r.id}`, at: r.sentAt, side: "SYSTEM", who: r.sentBy ?? "Equipe", body: `enviou a versão ${r.round}` });
      continue;
    }
    ev.push({ key: `s${r.id}`, at: r.sentAt, side: "SYSTEM", who: r.sentBy ?? "Equipe", body: r.round > 1 ? `enviou a versão ${r.round}${r.note ? `: "${r.note}"` : ""}` : `enviou para aprovar${r.note ? `: "${r.note}"` : ""}` });
    if (r.decidedAt && (r.status === "APPROVED" || r.status === "CHANGES")) {
      ev.push({
        key: `d${r.id}`,
        at: r.decidedAt,
        side: "CLIENT",
        who: r.decidedBy ?? "Cliente",
        tone: r.status === "APPROVED" ? "ok" : "warn",
        body: (
          <>
            <b>{r.status === "APPROVED" ? "Aprovou" : `Pediu ajuste${r.changeTargets.length ? ` em ${targetsLabel(r.changeTargets)}` : ""}`}</b>
            {r.clientComment && <span className="mt-0.5 block">{r.clientComment}</span>}
          </>
        ),
      });
    }
  }
  for (const m of p.messages) ev.push({ key: m.id, at: m.createdAt, side: m.author, who: m.name, body: m.body });
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}

export function PostInspector({ postId, onClose, onChanged, boardHref = true }: { postId: string; onClose: () => void; onChanged?: () => void; boardHref?: boolean }) {
  const { toast, confirm } = useFeedback();
  const [post, setPost] = useState<ApprovalPostView | null>(null);
  const [tab, setTab] = useState<"conversa" | "versoes">("conversa");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const res = await getApprovalPost(postId);
    if (!res.ok) {
      toast(res.error, "error");
      onClose();
      return;
    }
    setPost(res.data);
  }, [postId, toast, onClose]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o post ao abrir a janela
    load();
  }, [load]);

  const changed = async () => {
    await load();
    onChanged?.();
  };

  if (!post) {
    return (
      <Modal open onClose={onClose} size="xl" bare label="Post para aprovação">
        <div className="flex h-[60vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-fg-3" /></div>
      </Modal>
    );
  }

  const current = post.rounds[0] ?? null;
  const events = timeline(post);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "Não deu certo.", "error");
    toast(ok);
    await changed();
  };
  const copy = async () => ((await copyText(postLink(post.token))) ? toast("Link do post copiado") : toast("Não deu para copiar o link.", "error"));
  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    const res = await sendTeamMessage(post.id, reply);
    setSending(false);
    if (!res.ok) return toast(res.error, "error");
    setReply("");
    if (res.data) setPost(res.data);
    onChanged?.();
  };

  return (
    <Modal open onClose={onClose} size="xl" bare mobileFull label={post.title}>
      <div className="grid max-h-[min(860px,100dvh)] min-h-[min(640px,100dvh)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex items-center justify-center bg-surface-2 p-5 md:p-8">
          {current && current.format !== "TEXTO" && current.media.length > 0 ? (
            <MediaView base={FILE_BASE} media={current.media} format={current.format} className="max-w-[420px]" />
          ) : (
            <TextOnly text={current?.caption ?? "Sem texto"} />
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="grid gap-3 px-5 pb-3 pt-5 md:px-6">
            <div className="flex items-center gap-2">
              <ClientMark client={post.client} size={30} round />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-2">{post.client.name}</span>
              <IconButton ref={menuBtn} label="Mais ações" className="size-9" active={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal className="size-4" /></IconButton>
              <Popover anchor={menuBtn} open={menu} onClose={() => setMenu(false)} align="end" width={240}>
                <MenuItem icon={<RefreshCw className="size-4" />} onClick={async () => {
                  setMenu(false);
                  if (!(await confirm({ title: "Trocar o link deste post?", text: "O link antigo para de funcionar na hora.", confirm: "Trocar link" }))) return;
                  act(async () => regeneratePostLink(post.id), "Link novo criado");
                }}>Trocar link do post</MenuItem>
                {post.status === "PUBLISHED" && <MenuItem icon={<Undo2 className="size-4" />} onClick={() => { setMenu(false); act(() => setApprovalPublished(post.id, false), "Voltou para aprovado"); }}>Desmarcar publicado</MenuItem>}
                {post.status !== "CANCELED" && (
                  <MenuItem danger icon={<Archive className="size-4" />} onClick={async () => {
                    setMenu(false);
                    if (!(await confirm({ title: "Arquivar este post?", text: "Ele sai do link do cliente. A demanda continua no quadro.", confirm: "Arquivar", danger: true }))) return;
                    act(() => archiveApproval(post.id), "Post arquivado");
                  }}>Arquivar</MenuItem>
                )}
              </Popover>
              <IconButton label="Fechar" className="size-9" onClick={onClose}><X className="size-4" /></IconButton>
            </div>
            <h2 className="text-balance text-[22px] font-semibold leading-tight">{post.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip status={post.status} />
              <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2">{APPROVAL_FORMAT_LABEL[post.format]}</span>
              {current && current.round > 1 && <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2">versão {current.round}</span>}
              {post.publishAt && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-xs font-medium text-fg-2"><CalendarClock className="size-3" /> {whenLabel(post.publishAt)}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {post.status !== "CANCELED" && <Button size="sm" variant="primary" onClick={() => setComposer(true)}><Upload className="size-3.5" /> Nova versão</Button>}
              {post.status === "APPROVED" && <Button size="sm" variant="dark" loading={busy} onClick={() => act(() => setApprovalPublished(post.id, true), "Marcado como publicado")}><Send className="size-3.5" /> Marcar publicado</Button>}
              <Button size="sm" onClick={copy}><Copy className="size-3.5" /> Copiar link</Button>
              <a href={whatsappShare(post)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-medium hover:bg-surface-2"><MessageCircle className="size-3.5" /> WhatsApp</a>
              <a href={`/aprovar/p/${post.token}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"><ExternalLink className="size-3.5" /> Ver como cliente</a>
              {post.card && boardHref && <Link href={`/quadros/${post.card.boardId}?demanda=${post.card.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"><SquareKanban className="size-3.5" /> #{post.card.number} em {post.card.boardName}</Link>}
            </div>
          </div>

          <div className="mx-5 flex gap-1 rounded-full bg-surface-2 p-1 md:mx-6">
            {([["conversa", "Conversa e histórico"], ["versoes", `Versões (${post.rounds.length})`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn("h-8 flex-1 rounded-full text-[13px] font-medium transition-colors", tab === k ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg")}>{label}</button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
            {tab === "conversa" ? (
              <div className="grid gap-3">
                {current?.caption && current.format !== "TEXTO" && (
                  <div className="rounded-2xl bg-surface-2 p-3.5">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-3">Legenda</p>
                    <p className="prose-lite whitespace-pre-wrap text-sm">{current.caption}</p>
                  </div>
                )}
                {events.map((e) =>
                  e.side === "SYSTEM" ? (
                    <p key={e.key} className="text-center text-xs text-fg-3">{e.who.split(" ")[0]} {e.body} · {relativeTime(e.at)}</p>
                  ) : (
                    <div key={e.key} className={cn("flex", e.side === "TEAM" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-[20px] px-3.5 py-2.5 text-sm", e.side === "TEAM" ? "rounded-br-md bg-panel text-panel-fg" : e.tone === "ok" ? "rounded-bl-md bg-success/12" : e.tone === "warn" ? "rounded-bl-md bg-danger/10" : "rounded-bl-md bg-surface-2")}>
                        <p className={cn("mb-0.5 text-[11px] font-semibold", e.side === "TEAM" ? "text-panel-fg-2" : "text-fg-3")}>{e.side === "CLIENT" ? `${e.who} · cliente` : e.who.split(" ")[0]} · {relativeTime(e.at)}</p>
                        <div className="prose-lite whitespace-pre-wrap">{e.body}</div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                {post.rounds.map((r) => (
                  <div key={r.id} className="grid gap-2.5 rounded-2xl bg-surface-2 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Versão {r.round}</span>
                      {r.status === "CANCELED" ? <span className="text-xs text-fg-3">substituída</span> : <StatusChip status={r.status} size="xs" />}
                      <span className="ml-auto text-xs text-fg-3">{relativeTime(r.sentAt)}{r.sentBy ? ` por ${r.sentBy.split(" ")[0]}` : ""}</span>
                    </div>
                    {r.media.length > 0 && <div className="flex gap-2 overflow-x-auto">{r.media.map((m) => <Thumb key={m.id} base={FILE_BASE} media={m} className="size-16 rounded-xl" />)}</div>}
                    {r.caption && <p className="line-clamp-3 text-sm text-fg-2">{r.caption}</p>}
                    {r.clientComment && <p className="rounded-xl bg-surface px-3 py-2 text-sm"><b>{r.decidedBy}:</b> {r.clientComment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {post.status !== "CANCELED" && (
            <div className="flex items-end gap-2 border-t border-border px-5 py-3 md:px-6">
              <Textarea rows={1} value={reply} maxLength={1500} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }} placeholder="Responder ao cliente" aria-label="Responder ao cliente" className="max-h-32 min-h-10 resize-none" />
              <IconButton label="Enviar" onClick={send} className="size-10 bg-accent text-accent-ink hover:bg-accent-hover hover:text-accent-ink">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
              </IconButton>
            </div>
          )}
        </div>
      </div>
      {composer && (
        <Composer post={post} onClose={() => setComposer(false)} onDone={async () => {
          setComposer(false);
          await changed();
        }} />
      )}
    </Modal>
  );
}
