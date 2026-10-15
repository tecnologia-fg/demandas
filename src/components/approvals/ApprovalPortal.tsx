"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCheck, Columns3, Grid3x3, Loader2, MessageCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/Logo";
import { APPROVAL_FLOW, APPROVAL_FLOW_HINT, APPROVAL_FORMAT_LABEL, APPROVAL_META } from "@/lib/domain";
import type { PortalPost } from "@/lib/types";
import { Input } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { approveAll } from "@/app/actions/approval-public";
import { ClientMark, StatusChip, StatusDot, Thumb, whenLabel } from "./ui";
import { readName, Review, saveName } from "./Review";

type Client = { name: string; color: string; imageUrl: string | null };

function subscribe(cb: () => void) {
  window.addEventListener("dmanda:nome", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("dmanda:nome", cb);
    window.removeEventListener("storage", cb);
  };
}
/** Nome de quem aprova, guardado neste aparelho. */
export function useApproverName() {
  return useSyncExternalStore(subscribe, readName, () => "");
}

export function TopBar({ name, onEdit }: { name: string; onEdit: () => void }) {
  return (
    <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-4 pt-5 sm:px-6">
      <Logo size={22} />
      <span className="hidden text-sm text-fg-3 sm:block">Aprovação de conteúdo</span>
      <button type="button" onClick={onEdit} className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-surface pl-1.5 pr-3 text-[13px] font-medium shadow-sm">
        {name ? <span className="inline-flex size-6 items-center justify-center rounded-full bg-panel text-[10px] font-bold text-panel-fg">{name.trim().slice(0, 2).toUpperCase()}</span> : null}
        {name ? `Aprovando como ${name.split(" ")[0]}` : "Quem está aprovando?"}
        <Pencil className="size-3.5 text-fg-3" />
      </button>
    </header>
  );
}

export function NameModal({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Modal open onClose={onClose} size="sm" title="Quem está aprovando?" footer={<button type="button" onClick={() => { if (value.trim().length >= 2) { saveName(value); onClose(); } }} className="h-10 rounded-full bg-panel px-5 text-sm font-medium text-panel-fg">Salvar</button>}>
      <p className="mb-3 text-sm text-fg-2">Seu nome aparece para a equipe junto com cada aprovação e pedido de ajuste.</p>
      <Input autoFocus value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" />
    </Modal>
  );
}

export function ApprovalPortal({ token, client, posts }: { token: string; client: Client; posts: PortalPost[] }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const name = useApproverName();
  const [editName, setEditName] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [view, setView] = useState<"colunas" | "feed">("colunas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const pending = posts.filter((p) => p.status === "PENDING");
  const done = posts.filter((p) => p.status === "APPROVED" || p.status === "PUBLISHED").length;
  const pct = posts.length ? Math.round((done / posts.length) * 100) : 0;
  const count = (s: string) => posts.filter((p) => p.status === s).length;
  const shown = status ? posts.filter((p) => p.status === status) : posts;
  // a revisão percorre a lista que está na tela (pendentes primeiro quando aberta pelo botão)
  const order = openId && pending.some((p) => p.id === openId) && !status ? [...pending, ...posts.filter((p) => p.status !== "PENDING")] : shown;
  const idx = order.findIndex((p) => p.id === openId);
  const open = idx >= 0 ? order[idx] : null;

  const doApproveAll = async () => {
    if (!name) return setEditName(true);
    if (!(await confirm({ title: `Aprovar ${pending.length} ${pending.length === 1 ? "post" : "posts"}?`, text: `Todos os posts que esperam a sua decisão serão aprovados em nome de ${name}.`, confirm: "Aprovar todos" }))) return;
    setBusyAll(true);
    const res = await approveAll(token, name);
    setBusyAll(false);
    if (!res.ok) return toast(res.error, "error");
    toast(`${res.data.count} ${res.data.count === 1 ? "post aprovado" : "posts aprovados"}. Obrigado!`);
    router.refresh();
  };

  return (
    <div className="min-h-dvh pb-16">
      <TopBar name={name} onEdit={() => setEditName(true)} />

      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-[32px] bg-accent p-6 text-white sm:p-7">
          <div className="flex items-center gap-3">
            <ClientMark client={client} size={46} round />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold">{client.name}</p>
              <p className="text-sm opacity-75">Posts para aprovar</p>
            </div>
          </div>
          <p className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[52px]">{pending.length ? `${pending.length} ${pending.length === 1 ? "post espera" : "posts esperam"} você` : "Tudo em dia"}</p>
          <p className="mt-2 max-w-md text-[15px] opacity-85">{pending.length ? "Veja cada post, aprove ou peça ajuste. A equipe recebe na hora." : "Quando a equipe enviar um post novo, ele aparece aqui."}</p>
          {posts.length > 0 && (
            <div className="mt-6">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} /></div>
              <div className="mt-1.5 flex justify-between text-sm font-medium"><span>{done} de {posts.length} aprovados</span><span>{pct}%</span></div>
            </div>
          )}
          {pending.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setOpenId(pending[0].id)} className="inline-flex h-12 items-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:opacity-90">Revisar {pending.length === 1 ? "o post" : `${pending.length} posts`}</button>
              {pending.length > 1 && (
                <button type="button" onClick={doApproveAll} disabled={busyAll} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-brand-ink hover:bg-white/90">
                  {busyAll ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Aprovar todos
                </button>
              )}
            </div>
          )}
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
                  <span className={cn("block text-xs", status === s ? "text-panel-fg-2" : "text-fg-3")}>{APPROVAL_FLOW_HINT[s].client}</span>
                </span>
                <span className="text-xl font-semibold tabular-nums">{count(s)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3 pt-8 sm:px-6">
        <h2 className="mr-auto text-xl font-semibold">{status ? APPROVAL_META[status].short : "Todos os posts"} <span className="text-fg-3">{shown.length}</span></h2>
        <div className="inline-flex h-10 items-center rounded-full bg-surface p-1 shadow-sm">
          {([["colunas", "Colunas", Columns3], ["feed", "Feed", Grid3x3]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium", view === v ? "bg-panel text-panel-fg" : "text-fg-2 hover:text-fg")}><Icon className="size-3.5" /> {label}</button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
        {posts.length === 0 ? (
          <p className="mx-4 rounded-[28px] bg-surface px-6 py-14 text-center text-sm text-fg-3 shadow-sm sm:mx-6">Nenhum post por aqui ainda.</p>
        ) : view === "feed" ? (
          <div className="mx-4 grid grid-cols-3 gap-1 overflow-hidden rounded-[24px] sm:mx-6 sm:gap-1.5">
            {shown.map((p) => (
              <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="relative aspect-[4/5] overflow-hidden bg-surface-3">
                <Thumb base={`/api/aprovar/${token}`} media={p.media[0] ?? null} count={p.media.length} className="size-full" />
                <span className="absolute bottom-1.5 left-1.5"><StatusChip status={p.status} size="xs" /></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:px-6 lg:grid lg:grid-cols-4 lg:overflow-visible" style={status ? { display: "block" } : undefined}>
            {(status ? APPROVAL_FLOW.filter((s) => s === status) : APPROVAL_FLOW).map((s) => {
              // publicados: os mais recentes no topo
              const list = posts.filter((p) => p.status === s);
              if (s === "PUBLISHED") list.reverse();
              return (
                <section key={s} className={cn("grid w-[80vw] max-w-[320px] shrink-0 snap-start content-start gap-2.5 rounded-[28px] bg-surface-3/80 p-2.5 lg:w-auto lg:max-w-none", status && "w-full max-w-none")}>
                  <header className="flex items-center gap-2.5 px-1.5 pt-1">
                    <StatusDot status={s} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{APPROVAL_META[s].short}</p>
                      <p className="truncate text-[11.5px] text-fg-3">{APPROVAL_FLOW_HINT[s].client}</p>
                    </div>
                    <span className="pr-1.5 text-lg font-semibold tabular-nums">{list.length}</span>
                  </header>
                  {list.length === 0 ? (
                    <p className="px-3 py-5 text-center text-xs text-fg-3">Nada aqui</p>
                  ) : (
                    <div className={cn("grid gap-2.5", status && "sm:grid-cols-2 xl:grid-cols-3")}>
                      {list.map((p) => (
                        <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="flex w-full gap-3 rounded-[22px] bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md">
                          <Thumb base={`/api/aprovar/${token}`} media={p.media[0] ?? null} count={p.media.length} className="h-[84px] w-[68px] rounded-2xl" />
                          <span className="flex min-w-0 flex-1 flex-col py-0.5">
                            <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{p.title}</span>
                            {p.publishAt && <span className="mt-1 flex items-center gap-1 text-[11.5px] text-fg-3"><CalendarClock className="size-3" /> {whenLabel(p.publishAt)}</span>}
                            <span className="mt-auto flex items-center gap-2 pt-1 text-[11.5px] text-fg-3">
                              <span>{APPROVAL_FORMAT_LABEL[p.format]}</span>
                              {p.messages.length > 0 && <span className="ml-auto inline-flex items-center gap-0.5"><MessageCircle className="size-3" /> {p.messages.length}</span>}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <Modal open onClose={() => setOpenId(null)} size="xl" bare mobileFull label={open.title}>
          <div className="h-[min(860px,100dvh)] md:h-[min(780px,92dvh)]">
            <Review
              key={open.id}
              token={token}
              post={open}
              client={client}
              name={name}
              onName={() => {}}
              onClose={() => setOpenId(null)}
              nav={{ index: idx, total: order.length, prev: idx > 0 ? () => setOpenId(order[idx - 1].id) : undefined, next: idx < order.length - 1 ? () => setOpenId(order[idx + 1].id) : undefined }}
            />
          </div>
        </Modal>
      )}
      {editName && <NameModal initial={name} onClose={() => setEditName(false)} />}
    </div>
  );
}
