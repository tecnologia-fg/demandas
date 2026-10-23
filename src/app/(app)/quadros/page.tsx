import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { toUserLite } from "@/server/serialize";
import { todayKey, fromDayKey } from "@/lib/dates";
import { BoardsGrid, type BoardTile } from "@/components/boards/BoardsGrid";
import { LookupsProvider } from "@/components/board/lookups";
import { getLookups } from "@/server/lookups";
import { initials } from "@/lib/domain";

export const metadata: Metadata = { title: "Quadros" };

export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const user = await requireUser();
  const { novo } = await searchParams;
  const today = fromDayKey(todayKey())!;
  const boards = await db.board.findMany({
    orderBy: { position: "asc" },
    take: 300,
    include: {
      favorites: { where: { userId: user.id }, select: { userId: true } },
      columns: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, isDone: true } },
    },
  });
  const ids = boards.map((b) => b.id);
  const [perColumn, late, people, folders] = await Promise.all([
    db.card.groupBy({ by: ["columnId"], where: { boardId: { in: ids }, archivedAt: null, isTemplate: false, column: { archivedAt: null } }, _count: { _all: true } }),
    db.card.groupBy({ by: ["boardId"], where: { boardId: { in: ids }, archivedAt: null, isTemplate: false, column: { archivedAt: null }, completedAt: null, dueDate: { lt: today } }, _count: { _all: true } }),
    db.cardAssignee.findMany({
      where: { card: { boardId: { in: ids }, archivedAt: null, completedAt: null } },
      select: { card: { select: { boardId: true } }, user: { select: { id: true, name: true, color: true, avatarUrl: true } } },
      take: 3000,
    }),
    db.boardFolder.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const colCount = new Map(perColumn.map((p) => [p.columnId, p._count._all]));
  const lateCount = new Map(late.map((l) => [l.boardId, l._count._all]));
  const tiles: BoardTile[] = boards.map((b) => {
    const columns = b.columns.map((c) => ({ ...c, count: colCount.get(c.id) ?? 0 }));
    const members = new Map<string, ReturnType<typeof toUserLite>>();
    for (const p of people) if (p.card.boardId === b.id) members.set(p.user.id, toUserLite(p.user));
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      color: b.color,
      folderId: b.folderId,
      clientId: b.clientId,
      archived: Boolean(b.archivedAt),
      favorite: b.favorites.length > 0,
      columns,
      total: columns.reduce((s, c) => s + c.count, 0),
      done: columns.filter((c) => c.isDone).reduce((s, c) => s + c.count, 0),
      late: lateCount.get(b.id) ?? 0,
      members: [...members.values()],
    };
  });
  const lookups = await getLookups();
  return (
    <LookupsProvider me={{ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }} users={lookups.users} labels={lookups.labels} clients={lookups.clients}>
      <BoardsGrid boards={tiles} folders={folders} isAdmin={user.isAdmin} openNew={novo === "1"} />
    </LookupsProvider>
  );
}
