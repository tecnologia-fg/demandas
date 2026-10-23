"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { run } from "@/server/action";
import { toDayKey } from "@/lib/dates";

export async function searchCards(query: string) {
  return run(async () => {
    await assertUser();
    const q = z.string().trim().max(100).parse(query).replace(/^#/, "");
    if (!q) return [];
    const num = /^\d+$/.test(q) ? Number(q) : null;
    const cards = await db.card.findMany({
      where: {
        isTemplate: false,
        column: { archivedAt: null },
        board: { archivedAt: null },
        OR: [{ title: { contains: q } }, ...(num ? [{ number: num }] : []), { description: { contains: q } }, { client: { name: { contains: q } } }],
      },
      orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true, number: true, title: true, boardId: true, dueDate: true, completedAt: true, archivedAt: true,
        board: { select: { name: true, color: true } }, column: { select: { name: true } }, client: { select: { name: true } },
      },
    });
    return cards.map((c) => ({
      id: c.id, number: c.number, title: c.title, boardId: c.boardId, boardName: c.board.name, boardColor: c.board.color,
      columnName: c.client ? `${c.column.name} · ${c.client.name}` : c.column.name, dueDate: toDayKey(c.dueDate), done: Boolean(c.completedAt), archived: Boolean(c.archivedAt),
    }));
  });
}
