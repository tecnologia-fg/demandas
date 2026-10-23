import "server-only";
import { db } from "./db";
import { cardSummaryInclude, toCardSummary } from "./serialize";
import type { BoardData } from "@/lib/types";

export async function loadBoard(boardId: string, userId: string): Promise<BoardData | null> {
  const board = await db.board.findFirst({
    where: { id: boardId, archivedAt: null },
    include: {
      columns: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      favorites: { where: { userId }, select: { userId: true } },
    },
  });
  if (!board) return null;
  const cards = await db.card.findMany({
    where: { boardId, archivedAt: null, isTemplate: false, column: { archivedAt: null } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: cardSummaryInclude,
    take: 2000,
  });
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    color: board.color,
    clientId: board.clientId,
    favorite: board.favorites.length > 0,
    columns: board.columns.map((c) => ({ id: c.id, name: c.name, color: c.color, position: c.position, isDone: c.isDone, wipLimit: c.wipLimit })),
    cards: cards.map(toCardSummary),
  };
}
