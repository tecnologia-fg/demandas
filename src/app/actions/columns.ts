"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { fail, hex, id, run } from "@/server/action";
import { publishBoard } from "@/server/live";
import { logActivity } from "@/server/events";

export async function createColumn(boardId: string, name: string) {
  return run(async () => {
    await assertUser();
    const n = z.string().trim().min(1, "Dê um nome à coluna.").max(60).parse(name);
    const board = await db.board.findFirst({ where: { id: id.parse(boardId), archivedAt: null }, select: { id: true } });
    if (!board) fail("Quadro não encontrado.");
    const last = await db.column.findFirst({ where: { boardId }, orderBy: { position: "desc" }, select: { position: true } });
    const c = await db.column.create({ data: { boardId, name: n, position: (last?.position ?? -1) + 1 } });
    publishBoard(boardId, null);
    return { id: c.id, name: c.name, color: c.color, position: c.position, isDone: c.isDone, wipLimit: c.wipLimit };
  });
}

const columnPatch = z.object({
  name: z.string().trim().min(1, "Dê um nome à coluna.").max(60).optional(),
  color: hex.nullable().optional(),
  isDone: z.boolean().optional(),
  wipLimit: z.number().int().min(0).max(999).optional(),
});

export async function updateColumn(columnId: string, patch: z.input<typeof columnPatch>) {
  return run(async () => {
    const user = await assertUser();
    const data = columnPatch.parse(patch);
    const c = await db.column.update({ where: { id: id.parse(columnId) }, data });
    publishBoard(c.boardId, user.id);
  });
}

export async function reorderColumns(boardId: string, ids: string[]) {
  return run(async () => {
    await assertUser();
    const list = z.array(id).max(100).parse(ids);
    const cols = await db.column.findMany({ where: { boardId: id.parse(boardId) }, select: { id: true } });
    const valid = new Set(cols.map((c) => c.id));
    if (list.some((c) => !valid.has(c)) || list.length !== valid.size) fail("A ordem das colunas mudou. Atualize a página.");
    await db.$transaction(list.map((cid, i) => db.column.update({ where: { id: cid }, data: { position: i } })));
    publishBoard(boardId, null);
  });
}

/**
 * Exclui a coluna. Se tiver demandas (inclusive arquivadas), elas vão para `moveTo`, nunca são apagadas junto.
 * Sem `moveTo` e com demandas, devolve { needsTarget: true } para a tela perguntar o destino.
 */
export async function deleteColumn(columnId: string, moveTo: string | null) {
  return run(async () => {
    const user = await assertUser();
    const col = await db.column.findUnique({ where: { id: id.parse(columnId) }, include: { _count: { select: { cards: true } } } });
    if (!col) fail("Coluna não encontrada.");
    if (col._count.cards > 0) {
      if (!moveTo) return { needsTarget: true, count: col._count.cards };
      const target = await db.column.findFirst({ where: { id: id.parse(moveTo), boardId: col.boardId } });
      if (!target || target.id === col.id) fail("Escolha outra coluna do mesmo quadro.");
      await db.$transaction(async (tx) => {
        const last = await tx.card.findFirst({ where: { columnId: target.id }, orderBy: { position: "desc" }, select: { position: true } });
        const cards = await tx.card.findMany({ where: { columnId: col.id }, orderBy: { position: "asc" }, select: { id: true, completedAt: true } });
        const base = (last?.position ?? -1) + 1;
        for (const [i, c] of cards.entries()) {
          // regra da coluna de concluídas: entra concluída, sai reaberta
          const completedAt = target.isDone && !col.isDone ? (c.completedAt ?? new Date()) : !target.isDone && col.isDone ? null : c.completedAt;
          await tx.card.update({ where: { id: c.id }, data: { columnId: target.id, position: base + i, completedAt } });
          await logActivity(tx, c.id, user.id, "moved", { from: col.name, to: target.name });
        }
        await tx.column.delete({ where: { id: col.id } });
      });
    } else {
      await db.column.delete({ where: { id: col.id } });
    }
    publishBoard(col.boardId, user.id);
    return { needsTarget: false, count: 0 };
  });
}
