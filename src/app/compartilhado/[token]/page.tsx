import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { sanitizeRich } from "@/server/richtext";
import { toDayKey } from "@/lib/dates";
import { initials } from "@/lib/domain";
import { SharedBoard, type SharedData } from "@/components/share/SharedBoard";

// Quadro compartilhado: só leitura, sem login, pelo link com token. Não mostra comentários, anexos nem histórico.
export const dynamic = "force-dynamic";

const valid = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);

async function findBoard(token: string) {
  if (!valid(token)) return null;
  return db.board.findFirst({ where: { shareToken: token, archivedAt: null }, select: { id: true, name: true, description: true, color: true, client: { select: { name: true } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const b = await findBoard((await params).token);
  return { title: b ? b.name : "Quadro", robots: { index: false, follow: false } };
}

export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const board = await findBoard((await params).token);
  if (!board) notFound();
  const [columns, cards] = await Promise.all([
    db.column.findMany({ where: { boardId: board.id }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, isDone: true } }),
    db.card.findMany({
      where: { boardId: board.id, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 1000,
      select: {
        id: true, number: true, title: true, description: true, priority: true, dueDate: true, completedAt: true, coverColor: true, columnId: true,
        client: { select: { name: true, color: true } },
        labels: { select: { label: { select: { name: true, color: true } } } },
        assignees: { select: { user: { select: { name: true, color: true } } } },
        checklists: { orderBy: { position: "asc" }, select: { title: true, items: { orderBy: { position: "asc" }, select: { text: true, done: true } } } },
      },
    }),
  ]);
  const data: SharedData = {
    name: board.name,
    description: board.description,
    color: board.color,
    client: board.client?.name ?? null,
    columns,
    cards: cards.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      description: c.description ? sanitizeRich(c.description) : null,
      priority: c.priority,
      dueDate: toDayKey(c.dueDate),
      done: Boolean(c.completedAt),
      coverColor: c.coverColor,
      columnId: c.columnId,
      client: c.client,
      labels: c.labels.map((l) => l.label),
      people: c.assignees.map((a) => ({ name: a.user.name, color: a.user.color, initials: initials(a.user.name) })),
      checklists: c.checklists,
    })),
  };
  return <SharedBoard data={data} />;
}
