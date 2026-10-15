"use client";

import { useState } from "react";
import { BadgeCheck, CalendarClock, Copy, MessageCircle, Send, Upload } from "lucide-react";
import { APPROVAL_FORMAT_LABEL } from "@/lib/domain";
import { relativeTime } from "@/lib/dates";
import type { CardDetail, CardSummary } from "@/lib/types";
import { Button } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { useLookups } from "@/components/board/lookups";
import { StatusChip, Thumb, whenLabel } from "./ui";
import { Composer } from "./Composer";
import { copyText, PostInspector, postLink, whatsappShare } from "./PostInspector";
import { targetsLabel } from "./targets";

export { StatusChip } from "./ui";

const FILE_BASE = "/api/aprovacoes/arquivo";

/** Aprovação do cliente dentro da demanda: enviar, ver a situação, nova versão e o link do post. */
export function ApprovalSection({ card, onSummary, onReload }: { card: CardDetail; onSummary: (s: CardSummary) => void; onReload: () => void }) {
  const { toast } = useFeedback();
  const { clientById } = useLookups();
  const [composer, setComposer] = useState(false);
  const [inspect, setInspect] = useState(false);
  const post = card.approvalPost && card.approvalPost.status !== "CANCELED" ? card.approvalPost : null;
  const current = post?.rounds[0] ?? null;
  const lastClientMsg = post ? [...post.messages].reverse().find((m) => m.author === "CLIENT") : null;

  const done = (s: CardSummary | null) => {
    if (s) onSummary(s);
    onReload();
  };

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-panel text-panel-fg"><BadgeCheck className="size-4" /></span>
        <h3 className="text-[15px] font-semibold">Aprovação do cliente</h3>
        {!post && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => setComposer(true)} disabled={!card.clientId}>
            <Send className="size-3.5" /> Enviar para aprovação
          </Button>
        )}
      </div>

      {!post ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">
          {card.clientId ? "Envie as artes e a legenda. O cliente aprova ou pede ajuste pelo link, e a demanda anda sozinha no quadro." : "Ligue a demanda a um cliente para enviar para aprovação."}
        </p>
      ) : (
        <div className="grid gap-3 rounded-[24px] bg-surface-2 p-3">
          <button type="button" onClick={() => setInspect(true)} className="flex w-full gap-3 rounded-[18px] bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md">
            <Thumb base={FILE_BASE} media={current?.media[0] ?? null} count={current?.media.length} className="h-20 w-16 rounded-xl" />
            <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusChip status={post.status} size="xs" />
                <span className="text-xs text-fg-3">{APPROVAL_FORMAT_LABEL[post.format]}{current && current.round > 1 ? ` · versão ${current.round}` : ""}</span>
              </span>
              <span className="truncate text-sm font-semibold">{post.title}</span>
              <span className="truncate text-xs text-fg-3">
                {post.status === "PENDING" && current ? `enviado ${relativeTime(current.sentAt)}` : current?.decidedAt ? `${current.decidedBy ?? "cliente"} respondeu ${relativeTime(current.decidedAt)}` : ""}
              </span>
              {post.publishAt && <span className="flex items-center gap-1 text-xs text-fg-3"><CalendarClock className="size-3" /> vai ao ar {whenLabel(post.publishAt)}</span>}
            </span>
          </button>
          {current?.status === "CHANGES" && (
            <p className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-sm">
              <b>Ajuste{current.changeTargets.length ? ` em ${targetsLabel(current.changeTargets)}` : ""}:</b> {current.clientComment}
            </p>
          )}
          {lastClientMsg && (
            <p className="flex gap-2 rounded-2xl bg-surface px-3.5 py-2.5 text-sm"><MessageCircle className="mt-0.5 size-4 shrink-0 text-accent-strong" /><span><b>{lastClientMsg.name}:</b> {lastClientMsg.body}</span></p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => setComposer(true)}><Upload className="size-3.5" /> Nova versão</Button>
            <Button size="sm" onClick={async () => ((await copyText(postLink(post.token))) ? toast("Link do post copiado") : toast("Não deu para copiar o link.", "error"))}><Copy className="size-3.5" /> Link do post</Button>
            <a href={whatsappShare(post)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-medium hover:bg-surface-2"><MessageCircle className="size-3.5" /> WhatsApp</a>
            <Button size="sm" variant="ghost" onClick={() => setInspect(true)}>Conversa e versões</Button>
          </div>
        </div>
      )}

      {composer && (
        <Composer
          post={post ?? undefined}
          card={post ? undefined : { id: card.id, title: card.title, clientId: card.clientId, clientName: card.clientId ? clientById.get(card.clientId)?.name ?? null : null, attachments: card.attachments }}
          onClose={() => setComposer(false)}
          onDone={(r) => {
            setComposer(false);
            done(r.card);
          }}
        />
      )}
      {inspect && post && <PostInspector postId={post.id} boardHref={false} onClose={() => setInspect(false)} onChanged={onReload} />}
    </section>
  );
}
