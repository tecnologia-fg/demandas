"use client";

import Link from "next/link";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, CalendarDays, CheckCircle2, Inbox, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { ACTIVITY_TEXT } from "@/lib/domain";
import { addDays, relativeTime, todayKey } from "@/lib/dates";
import type { CardSummary, UserLite } from "@/lib/types";
import { Avatar, EmptyState, RoundCheck } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { DueChip } from "@/components/board/CardTile";
import { PriorityIcon } from "@/components/board/pickers";
import { CardModal } from "@/components/board/CardModal";
import { toggleComplete } from "@/app/actions/cards";

type MyCard = CardSummary & { boardName: string; boardColor: string; columnName: string };
type Act = { id: string; type: string; data: Record<string, string>; createdAt: string; user: UserLite | null; card: { id: string; number: number; title: string; boardId: string } };

const GREETING = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

export function HomeView({ firstName, cards: initial, doneWeek, favorites, activity }: { firstName: string; cards: MyCard[]; doneWeek: number; favorites: { id: string; name: string; color: string; open: number }[]; activity: Act[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [cards, setCards] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCards(initial);
  }
  const today = todayKey();
  const week = addDays(today, 7);

  const groups = useMemo(() => {
    const g = { late: [] as MyCard[], today: [] as MyCard[], week: [] as MyCard[], later: [] as MyCard[], none: [] as MyCard[] };
    for (const c of cards) {
      if (c.completedAt) continue;
      if (!c.dueDate) g.none.push(c);
      else if (c.dueDate < today) g.late.push(c);
      else if (c.dueDate === today) g.today.push(c);
      else if (c.dueDate <= week) g.week.push(c);
      else g.later.push(c);
    }
    return g;
  }, [cards, today, week]);

  const stats = [
    { label: "Atrasadas", value: groups.late.length, icon: AlertCircle, tone: "bg-danger text-white" },
    { label: "Para hoje", value: groups.today.length, icon: CalendarClock, tone: "bg-accent text-accent-ink" },
    { label: "Próximos 7 dias", value: groups.week.length, icon: CalendarDays, tone: "bg-panel text-panel-fg" },
    { label: "Concluídas na semana", value: doneWeek, icon: CheckCircle2, tone: "bg-success text-white" },
  ];

  const sections: [string, MyCard[]][] = [
    ["Atrasadas", groups.late],
    ["Hoje", groups.today],
    ["Próximos 7 dias", groups.week],
    ["Mais pra frente", groups.later],
    ["Sem prazo", groups.none],
  ];

  return (
    <div className="px-4 pb-10 pt-6 lg:px-6">
      <LiveRefresh />
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-tight lg:text-[34px]">{GREETING()}, {firstName}</h1>
        <p className="mt-1 text-sm text-fg-2">
          {groups.late.length + groups.today.length > 0
            ? `Você tem ${groups.late.length + groups.today.length} ${groups.late.length + groups.today.length === 1 ? "demanda pedindo atenção" : "demandas pedindo atenção"} hoje.`
            : "Nada vencendo hoje. Bom momento para adiantar a semana."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="glass flex items-center gap-3.5 rounded-[24px] p-4">
            <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full", tone)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[26px] font-semibold leading-none tabular-nums">{value}</p>
              <p className="mt-1 truncate text-[13px] text-fg-2">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="glass grid content-start gap-5 rounded-[26px] p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Minhas demandas</h2>
          {cards.filter((c) => !c.completedAt).length === 0 && (
            <EmptyState icon={<Inbox className="size-5" />} title="Nada com você agora" text="Quando alguém te colocar como responsável numa demanda, ela aparece aqui." />
          )}
          {sections.map(([title, list]) =>
            list.length === 0 ? null : (
              <div key={title} className="grid gap-1.5">
                <p className={cn("px-1 text-xs font-semibold uppercase tracking-wide", title === "Atrasadas" ? "text-danger" : "text-fg-3")}>
                  {title} <span className="font-normal">{list.length}</span>
                </p>
                {list.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(c.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <RoundCheck
                      checked={false}
                      label="Concluir"
                      size={20}
                      onChange={async () => {
                        setCards((all) => all.map((x) => (x.id === c.id ? { ...x, completedAt: new Date().toISOString() } : x)));
                        const res = await toggleComplete(c.id);
                        if (!res.ok) {
                          toast(res.error, "error");
                          setCards((all) => all.map((x) => (x.id === c.id ? { ...x, completedAt: null } : x)));
                        } else {
                          toast("Demanda concluída");
                          router.refresh();
                        }
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{c.title}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-fg-3">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: c.boardColor }} />
                        {c.boardName} · {c.columnName}
                      </p>
                    </div>
                    <PriorityIcon priority={c.priority} size={22} />
                    {c.dueDate && <span className="hidden sm:inline"><DueChip due={c.dueDate} done={false} size="xs" /></span>}
                  </div>
                ))}
              </div>
            ),
          )}
        </section>

        <div className="grid content-start gap-6">
          <section className="glass grid gap-2 rounded-[26px] p-4">
            <h2 className="px-1 pb-1 font-semibold">Quadros favoritos</h2>
            {favorites.length === 0 && <p className="px-1 text-sm text-fg-3">Marque a estrela de um quadro para ele aparecer aqui.</p>}
            {favorites.map((b) => (
              <Link key={b.id} href={`/quadros/${b.id}`} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 text-sm shadow-sm transition-shadow hover:shadow-md">
                <span className="size-3 rounded-full" style={{ background: b.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                <span className="text-xs text-fg-3">{b.open} em aberto</span>
                <Star className="size-3.5 text-accent-strong" fill="currentColor" />
              </Link>
            ))}
          </section>

          <section className="glass grid gap-3 rounded-[26px] p-4">
            <h2 className="px-1 font-semibold">Movimento da equipe</h2>
            {activity.length === 0 && <p className="px-1 text-sm text-fg-3">Ainda sem movimento.</p>}
            {activity.map((a) => (
              <Link key={a.id} href={`/quadros/${a.card.boardId}?demanda=${a.card.id}`} className="flex items-start gap-2.5 rounded-xl px-1 py-0.5 text-[13px] hover:bg-surface/60">
                {a.user ? <Avatar user={a.user} size={26} /> : <span className="size-[26px] rounded-full bg-surface-3" />}
                <p className="min-w-0 flex-1 leading-snug text-fg-2">
                  <span className="font-medium text-fg">{a.user?.name.split(" ")[0] ?? "Sistema"}</span> {ACTIVITY_TEXT[a.type]?.(a.data) ?? a.type} em{" "}
                  <span className="font-medium text-fg">{a.card.title}</span>
                  <span className="block text-xs text-fg-3">{relativeTime(a.createdAt)}</span>
                </p>
              </Link>
            ))}
          </section>
        </div>
      </div>

      {open && (
        <CardModal
          key={open}
          cardId={open}
          onClose={() => {
            setOpen(null);
            router.refresh();
          }}
          onChange={(s) => setCards((all) => all.map((x) => (x.id === s.id ? { ...x, ...s } : x)))}
          onRemoved={(id) => {
            setCards((all) => all.filter((x) => x.id !== id));
            setOpen(null);
          }}
          onOpenOther={(id) => setOpen(id)}
        />
      )}
    </div>
  );
}
