import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getLookups } from "@/server/lookups";
import { cardSummaryInclude, toCardSummary, toUserLite } from "@/server/serialize";
import { initials } from "@/lib/domain";
import { LookupsProvider } from "@/components/board/lookups";
import { HomeView } from "@/components/home/HomeView";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}

export const metadata: Metadata = { title: "Início" };

export default async function HomePage() {
  const user = await requireUser();
  const weekAgo = daysAgo(7);
  const [mine, doneWeek, favorites, activity, lookups] = await Promise.all([
    db.card.findMany({
      where: { archivedAt: null, completedAt: null, board: { archivedAt: null }, assignees: { some: { userId: user.id } } },
      include: { ...cardSummaryInclude, board: { select: { name: true, color: true } }, column: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 300,
    }),
    db.card.count({ where: { completedAt: { gte: weekAgo }, assignees: { some: { userId: user.id } } } }),
    db.board.findMany({
      where: { archivedAt: null, favorites: { some: { userId: user.id } } },
      orderBy: { position: "asc" },
      take: 8,
      select: { id: true, name: true, color: true, _count: { select: { cards: { where: { archivedAt: null, completedAt: null } } } } },
    }),
    db.activity.findMany({
      where: { card: { board: { archivedAt: null } }, type: { in: ["created", "moved", "completed", "attachment", "assigned"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: { select: { id: true, name: true, color: true, avatarUrl: true } }, card: { select: { id: true, number: true, title: true, boardId: true } } },
    }),
    getLookups(),
  ]);

  return (
    <LookupsProvider me={{ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }} users={lookups.users} labels={lookups.labels} clients={lookups.clients}>
      <HomeView
        firstName={user.name.split(" ")[0]}
        cards={mine.map((c) => ({ ...toCardSummary(c), boardName: c.board.name, boardColor: c.board.color, columnName: c.column.name }))}
        doneWeek={doneWeek}
        favorites={favorites.map((b) => ({ id: b.id, name: b.name, color: b.color, open: b._count.cards }))}
        activity={activity.map((a) => ({
          id: a.id,
          type: a.type,
          data: (() => { try { return JSON.parse(a.data); } catch { return {}; } })(),
          createdAt: a.createdAt.toISOString(),
          user: a.user ? toUserLite(a.user) : null,
          card: a.card,
        }))}
      />
    </LookupsProvider>
  );
}
