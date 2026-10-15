"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Columns3, Copy, ExternalLink, List, MessageCircle, Plus, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { APPROVAL_FLOW, APPROVAL_FLOW_HINT, APPROVAL_FORMAT_LABEL, APPROVAL_META } from "@/lib/domain";
import { relativeTime } from "@/lib/dates";
import type { ApprovalMedia } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { getClientApprovalLink, regenerateClientApprovalLink } from "@/app/actions/approvals";
import { ClientMark, StatusChip, StatusDot, Thumb, whenLabel } from "./ui";
import { Composer } from "./Composer";
import { copyText, PostInspector } from "./PostInspector";

export type ApprovalRow = {
  id: string; token: string; title: string; format: string; status: "PENDING" | "APPROVED" | "CHANGES" | "PUBLISHED"; publishAt: string | null; updatedAt: string;
  client: { id: string; name: string; color: string; imageUrl: string | null };
  card: { id: string; number: number; boardId: string; boardName: string } | null;
  round: number; sentAt: string; decidedAt: string | null; decidedBy: string | null; clientComment: string | null;
  thumb: ApprovalMedia | null; mediaCount: number; messages: number; clientWaiting: boolean;
};
type ClientOpt = { id: string; name: string; color: string; imageUrl: string | null; hasLink: boolean };

const FILE_BASE = "/api/aprovacoes/arquivo";

export function ApprovalsView({ rows, clients, boards, approved30, isAdmin, openPost }: { rows: ApprovalRow[]; clients: ClientOpt[]; boards: { id: string; name: string }[]; approved30: number; isAdmin: boolean; openPost: string | null }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"colunas" | "lista">("colunas");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(openPost);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (!clientId || r.client.id === clientId) && (!needle || r.title.toLowerCase().includes(needle) || r.client.name.toLowerCase().includes(needle)));
  }, [rows, clientId, q]);
  const count = (s: string) => filtered.filter((r) => r.status === s).length;
  const pending = count("PENDING");
  const waitingReply = filtered.filter((r) => r.clientWaiting).length;
  const oldest = filtered.filter((r) => r.status === "PENDING").sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0];
  const withPosts = clients.filter((c) => c.hasLink || rows.some((r) => r.client.id === c.id));
  const flow = status ? APPROVAL_FLOW.filter((s) => s === status) : APPROVAL_FLOW;

  return (
    <div className="pb-12">
      <LiveRefresh />
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-2 lg:px-6">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-3xl">Aprovações</h1>
          <p className="text-sm text-fg-2">Posts e demandas que os clientes aprovam pelo link</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> Nova aprovação</Button>
      </div>

      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:px-6">
        <section className="relative overflow-hidden rounded-[32px] bg-accent p-6 text-white sm:p-7">
          <p className="text-sm font-medium opacity-80">{clientId ? clients.find((c) => c.id === clientId)?.name : "Todos os clientes"}</p>
          <p className="mt-1 text-[44px] font-semibold leading-none tracking-tight sm:text-[56px]">{pending}</p>
          <p className="mt-1 text-lg font-medium">{pending === 1 ? "post esperando o cliente" : "posts esperando o cliente"}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/20 px-3 py-1.5 font-medium">{approved30} {approved30 === 1 ? "aprovado" : "aprovados"} em 30 dias</span>
            {oldest && <span className="rounded-full bg-white/20 px-3 py-1.5 font-medium">mais antigo enviado {relativeTime(oldest.sentAt)}</span>}
            {waitingReply > 0 && <span className="rounded-full bg-brand-ink px-3 py-1.5 font-medium text-white">{waitingReply} {waitingReply === 1 ? "mensagem do cliente" : "mensagens do cliente"}</span>}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-ink px-5 text-sm font-medium text-white hover:opacity-90"><Plus className="size-4" /> Nova aprovação</button>
            {pending > 0 && <button type="button" onClick={() => setStatus("PENDING")} className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-brand-ink hover:bg-white/90">Ver o que está com o cliente</button>}
          </div>
        </section>

        <section className="rounded-[32px] bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Resumo</h2>
          <p className="text-xs text-fg-3">Toque numa linha para ver só esses posts</p>
          <div className="mt-4 grid gap-2">
            {APPROVAL_FLOW.map((s) => (
              <button key={s} type="button" onClick={() => setStatus((v) => (v === s ? null : s))} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors", status === s ? "bg-panel text-panel-fg" : "bg-surface-2 hover:bg-surface-3")}>
                <StatusDot status={s} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{APPROVAL_META[s].short}</span>
                  <span className={cn("block text-xs", status === s ? "text-panel-fg-2" : "text-fg-3")}>{APPROVAL_FLOW_HINT[s].team}</span>
                </span>
                <span className="text-xl font-semibold tabular-nums">{count(s)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-7 lg:px-6">
        <h2 className="mr-auto text-xl font-semibold">Todos os posts <span className="text-fg-3">{filtered.length}</span></h2>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar post ou cliente" className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="inline-flex h-10 items-center rounded-full bg-surface p-1 shadow-sm">
          {([["colunas", "Colunas", Columns3], ["lista", "Lista", List]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", view === v ? "bg-panel text-panel-fg" : "text-fg-2 hover:text-fg")}><Icon className="size-3.5" /> {label}</button>
          ))}
        </div>
      </div>

      {clients.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] lg:px-6">
          <button type="button" onClick={() => setClientId(null)} className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium", !clientId ? "bg-panel text-panel-fg" : "bg-surface text-fg-2 shadow-sm hover:text-fg")}>Todos</button>
          {withPosts.map((c) => (
            <button key={c.id} type="button" onClick={() => setClientId((v) => (v === c.id ? null : c.id))} className={cn("inline-flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3.5 text-[13px] font-medium", clientId === c.id ? "bg-panel text-panel-fg" : "bg-surface text-fg-2 shadow-sm hover:text-fg")}>
              <ClientMark client={c} size={28} round /> {c.name}
            </button>
          ))}
        </div>
      )}

      {view === "colunas" ? (
        <div className="flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-6" style={status ? { display: "block" } : undefined}>
          {flow.map((s) => {
            const list = filtered.filter((r) => r.status === s);
            return (
              <section key={s} className={cn("grid w-[82vw] max-w-[340px] shrink-0 snap-start content-start gap-2.5 rounded-[28px] bg-surface-3/80 p-2.5 lg:w-auto lg:max-w-none", status && "w-full max-w-none")}>
                <header className="flex items-center gap-2.5 px-1.5 pb-1 pt-1">
                  <StatusDot status={s} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{APPROVAL_META[s].short}</p>
                    <p className="truncate text-[11.5px] text-fg-3">{APPROVAL_FLOW_HINT[s].team}</p>
                  </div>
                  <span className="pr-1.5 text-lg font-semibold tabular-nums">{list.length}</span>
                </header>
                {list.length === 0 ? (
                  <p className="rounded-2xl px-3 py-6 text-center text-xs text-fg-3">Nada aqui</p>
                ) : (
                  <div className={cn("grid gap-2.5", status && "sm:grid-cols-2 xl:grid-cols-3")}>
                    {list.map((r) => <PostCard key={r.id} r={r} onOpen={() => setOpen(r.id)} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mx-4 overflow-hidden rounded-[28px] bg-surface shadow-sm lg:mx-6">
          {filtered.filter((r) => !status || r.status === status).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-3">Nenhum post aqui.</p>
          ) : (
            filtered.filter((r) => !status || r.status === status).map((r) => (
              <button key={r.id} type="button" onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-surface-2">
                <Thumb base={FILE_BASE} media={r.thumb} count={r.mediaCount} className="size-12 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-fg-3">{r.client.name} · {APPROVAL_FORMAT_LABEL[r.format]}{r.round > 1 ? ` · versão ${r.round}` : ""}{r.card ? ` · #${r.card.number}` : ""}</span>
                </span>
                {r.clientWaiting && <MessageCircle className="size-4 text-accent-strong" />}
                <span className="hidden text-xs text-fg-3 sm:block">{relativeTime(r.updatedAt)}</span>
                <StatusChip status={r.status} size="xs" />
              </button>
            ))
          )}
        </div>
      )}

      {withPosts.length > 0 && (
        <section className="px-4 pt-8 lg:px-6">
          <h2 className="text-xl font-semibold">Links dos clientes</h2>
          <p className="text-sm text-fg-2">Cada cliente tem um link com todos os posts dele. Cada post também tem o próprio link.</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {withPosts.map((c) => <ClientLink key={c.id} c={c} pending={rows.filter((r) => r.client.id === c.id && r.status === "PENDING").length} isAdmin={isAdmin} />)}
          </div>
        </section>
      )}

      {creating && (
        <Composer clients={clients} boards={boards} onClose={() => setCreating(false)} onDone={({ postId }) => {
          setCreating(false);
          setOpen(postId);
          router.refresh();
        }} />
      )}
      {open && <PostInspector postId={open} onClose={() => setOpen(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}

function PostCard({ r, onOpen }: { r: ApprovalRow; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full gap-3 rounded-[22px] bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md">
      <Thumb base={FILE_BASE} media={r.thumb} count={r.mediaCount} className="h-[84px] w-[68px] rounded-2xl" />
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{r.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-fg-3">
          <ClientMark client={r.client} size={14} round /> <span className="truncate">{r.client.name}</span>
        </span>
        {r.status === "CHANGES" && r.clientComment ? (
          <span className="mt-1 line-clamp-1 text-[11.5px] text-danger">“{r.clientComment}”</span>
        ) : r.publishAt ? (
          <span className="mt-1 flex items-center gap-1 text-[11.5px] text-fg-3"><CalendarClock className="size-3" /> {whenLabel(r.publishAt)}</span>
        ) : null}
        <span className="mt-auto flex items-center gap-2 pt-1 text-[11.5px] text-fg-3">
          <span>{APPROVAL_FORMAT_LABEL[r.format]}{r.round > 1 ? ` · v${r.round}` : ""}</span>
          {r.messages > 0 && <span className={cn("ml-auto inline-flex items-center gap-0.5", r.clientWaiting && "font-semibold text-accent-strong")}><MessageCircle className="size-3" /> {r.messages}</span>}
        </span>
      </span>
    </button>
  );
}

function ClientLink({ c, pending, isAdmin }: { c: ClientOpt; pending: number; isAdmin: boolean }) {
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const url = (token: string) => `${window.location.origin}/aprovar/${token}`;
  const copy = async () => {
    const res = await getClientApprovalLink(c.id);
    if (!res.ok) return toast(res.error, "error");
    if (await copyText(url(res.data.token))) toast(`Link de ${c.name} copiado`);
    else toast("Não deu para copiar o link.", "error");
    router.refresh();
  };
  const open = async () => {
    const res = await getClientApprovalLink(c.id);
    if (!res.ok) return toast(res.error, "error");
    window.open(url(res.data.token), "_blank", "noopener,noreferrer");
  };
  const regen = async () => {
    if (!(await confirm({ title: `Trocar o link de ${c.name}?`, text: "O link antigo para de funcionar na hora.", confirm: "Trocar link" }))) return;
    const res = await regenerateClientApprovalLink(c.id);
    if (!res.ok) return toast(res.error, "error");
    toast("Link novo criado");
    router.refresh();
  };
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[22px] bg-surface p-2.5 pr-2 shadow-sm">
      <ClientMark client={c} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{c.name}</span>
        <span className="block text-xs text-fg-3">{pending ? `${pending} esperando aprovação` : "nada pendente"}</span>
      </span>
      <IconButton className="size-9" label={`Copiar link de ${c.name}`} onClick={copy}><Copy className="size-4" /></IconButton>
      <IconButton className="size-9" label={`Abrir como ${c.name}`} onClick={open}><ExternalLink className="size-4" /></IconButton>
      {isAdmin && <IconButton className="size-9" label={`Trocar link de ${c.name}`} onClick={regen}><RefreshCw className="size-4" /></IconButton>}
    </div>
  );
}
