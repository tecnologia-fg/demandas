"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin, assertUser } from "@/server/auth/current";
import { loadBoard } from "@/server/board";
import { audit, nextCardNumber } from "@/server/events";
import { fail, hex, id, run } from "@/server/action";
import { publishBoard } from "@/server/live";

const TEMPLATES: Record<string, { name: string; color?: string; isDone?: boolean }[]> = {
  basico: [{ name: "A fazer" }, { name: "Fazendo", color: "#155E75" }, { name: "Revisão", color: "#3BB3C3" }, { name: "Concluído", color: "#1E7F4F", isDone: true }],
  conteudo: [
    { name: "Ideias" },
    { name: "Briefing", color: "#34C38F" },
    { name: "Produção", color: "#155E75" },
    { name: "Revisão interna", color: "#3BB3C3" },
    { name: "Aprovação do cliente", color: "#0B9A82" },
    { name: "Publicado", color: "#1E7F4F", isDone: true },
  ],
  sprint: [{ name: "Backlog" }, { name: "Esta semana", color: "#34C38F" }, { name: "Em andamento", color: "#155E75" }, { name: "Bloqueado", color: "#0E7C6B" }, { name: "Feito", color: "#1E7F4F", isDone: true }],
  vazio: [],
};

const boardInput = z.object({
  name: z.string().trim().min(1, "Dê um nome ao quadro.").max(80),
  description: z.string().trim().max(300).optional().nullable(),
  color: hex,
  clientId: id.nullable().optional(),
});

async function checkClient(clientId: string | null | undefined) {
  if (!clientId) return clientId ?? null;
  const c = await db.client.findFirst({ where: { id: clientId, active: true }, select: { id: true } });
  if (!c) fail("Cliente não encontrado.");
  return c.id;
}

export async function createBoard(input: { name: string; description?: string | null; color: string; clientId?: string | null; template: string; folderId?: string | null }) {
  return run(async () => {
    const user = await assertUser();
    const data = boardInput.parse(input);
    data.clientId = await checkClient(data.clientId);
    // pasta opcional: quadro criado de dentro de uma pasta já nasce nela
    const folderId = input.folderId ? (await db.boardFolder.findUnique({ where: { id: id.parse(input.folderId) }, select: { id: true } }))?.id ?? null : null;
    const saved = input.template.startsWith("tpl:") ? await db.boardTemplate.findUnique({ where: { id: id.parse(input.template.slice(4)) } }) : null;
    if (input.template.startsWith("tpl:") && !saved) fail("Modelo de quadro não encontrado.");
    const columns: { name: string; color?: string | null; isDone?: boolean; wipLimit?: number }[] = saved
      ? parseJson<TplColumn[]>(saved.columns, [])
      : TEMPLATES[z.enum(["basico", "conteudo", "sprint", "vazio"]).parse(input.template)];
    const tplCards = saved ? parseJson<TplCard[]>(saved.cards, []) : [];
    const last = await db.board.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const board = await db.$transaction(async (tx) => {
      const b = await tx.board.create({
        data: {
          ...data,
          folderId,
          position: (last?.position ?? 0) + 1,
          favorites: { create: { userId: user.id } },
        },
      });
      const colIds: string[] = [];
      for (const [i, c] of columns.entries()) {
        const nc = await tx.column.create({ data: { boardId: b.id, name: c.name, color: c.color ?? null, isDone: c.isDone ?? false, wipLimit: c.wipLimit ?? 0, position: i } });
        colIds.push(nc.id);
      }
      if (tplCards.length && colIds.length) {
        const validLabels = new Set((await tx.label.findMany({ select: { id: true } })).map((l) => l.id));
        const numbers = await reserveNumbers(tx, tplCards.length);
        for (const [i, c] of tplCards.entries()) {
          await tx.card.create({
            data: {
              number: numbers[i],
              title: c.title,
              description: c.description,
              priority: c.priority,
              clientId: data.clientId ?? null,
              position: i,
              boardId: b.id,
              columnId: colIds[Math.min(c.column, colIds.length - 1)],
              createdById: user.id,
              labels: { create: c.labelIds.filter((l) => validLabels.has(l)).map((labelId) => ({ labelId })) },
              checklists: c.checklist.length ? { create: { title: "Checklist", items: { create: c.checklist.map((text, k) => ({ text, position: k })) } } } : undefined,
            },
          });
        }
      }
      return b;
    });
    revalidatePath("/", "layout");
    return { id: board.id };
  });
}

export async function updateBoard(boardId: string, input: { name: string; description?: string | null; color: string; clientId?: string | null }) {
  return run(async () => {
    await assertUser();
    const data = boardInput.parse(input);
    data.clientId = await checkClient(data.clientId);
    await db.board.update({ where: { id: id.parse(boardId) }, data });
    publishBoard(boardId, null);
    revalidatePath("/", "layout");
  });
}

export async function archiveBoard(boardId: string, archived: boolean) {
  return run(async () => {
    const user = await assertAdmin();
    const b = await db.board.update({ where: { id: id.parse(boardId) }, data: { archivedAt: archived ? new Date() : null } });
    publishBoard(b.id, user.id);
    await audit(user.id, archived ? "board.archive" : "board.restore", b.name);
    revalidatePath("/", "layout");
  });
}

export async function deleteBoard(boardId: string, confirmName: string) {
  return run(async () => {
    const user = await assertAdmin();
    const b = await db.board.findUnique({ where: { id: id.parse(boardId) } });
    if (!b) fail("Quadro não encontrado.");
    if (b.name.trim() !== confirmName.trim()) fail("Digite o nome do quadro exatamente para confirmar.");
    await db.board.delete({ where: { id: b.id } });
    await audit(user.id, "board.delete", b.name);
    revalidatePath("/", "layout");
  });
}

export async function toggleFavorite(boardId: string) {
  return run(async () => {
    const user = await assertUser();
    const key = { userId_boardId: { userId: user.id, boardId: id.parse(boardId) } };
    const existing = await db.boardFavorite.findUnique({ where: key });
    if (existing) await db.boardFavorite.delete({ where: key });
    else await db.boardFavorite.create({ data: { userId: user.id, boardId } });
    revalidatePath("/", "layout");
    return !existing;
  });
}

export async function reorderBoards(ids: string[]) {
  return run(async () => {
    await assertUser();
    const list = z.array(id).max(500).parse(ids);
    await db.$transaction(list.map((bid, i) => db.board.update({ where: { id: bid }, data: { position: i } })));
    revalidatePath("/", "layout");
  });
}

/** Foto atual do quadro, para manter a tela em dia com o que a equipe mexeu. */
export async function getBoardSnapshot(boardId: string) {
  return run(async () => {
    const user = await assertUser();
    const board = await loadBoard(id.parse(boardId), user.id);
    if (!board) fail("Quadro não encontrado.");
    return board;
  });
}

export async function listBoardsForMove() {
  return run(async () => {
    await assertUser();
    const boards = await db.board.findMany({
      where: { archivedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, name: true, color: true, columns: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true } } },
      take: 300,
    });
    return boards;
  });
}

export async function listArchivedCards(boardId: string) {
  return run(async () => {
    await assertUser();
    const cards = await db.card.findMany({
      where: { boardId: id.parse(boardId), archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: 200,
      select: { id: true, number: true, title: true, archivedAt: true, column: { select: { name: true } } },
    });
    return cards.map((c) => ({ id: c.id, number: c.number, title: c.title, archivedAt: c.archivedAt!.toISOString(), columnName: c.column.name }));
  });
}

// ---------- Duplicar quadro e modelos de quadro ----------

type TplColumn = { name: string; color: string | null; isDone: boolean; wipLimit: number };
type TplCard = { column: number; title: string; description: string | null; priority: string | null; checklist: string[]; labelIds: string[] };

function parseJson<T>(s: string, fallback: T): T {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Próximos números de demanda (#), reservados de uma vez. */
async function reserveNumbers(tx: Prisma.TransactionClient, count: number) {
  const start = await nextCardNumber(tx);
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Copia o quadro (colunas, cliente padrão) e, se pedido, as demandas em aberto e concluídas não arquivadas. */
export async function duplicateBoard(boardId: string, input: { name: string; withCards: boolean }) {
  return run(async () => {
    const user = await assertUser();
    const name = z.string().trim().min(1, "Dê um nome ao quadro.").max(80).parse(input.name);
    const src = await db.board.findFirst({
      where: { id: id.parse(boardId), archivedAt: null },
      include: {
        columns: { where: { archivedAt: null }, orderBy: { position: "asc" } },
        cards: {
          // sem demandas: filtro que não traz nada (mantém o tipo do include)
          where: input.withCards ? { archivedAt: null, isTemplate: false, column: { archivedAt: null } } : { id: "" },
          orderBy: { position: "asc" },
          take: 1000,
          include: { assignees: true, labels: true, checklists: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } } },
        },
      },
    });
    if (!src) fail("Quadro não encontrado.");
    const last = await db.board.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const newId = await db.$transaction(async (tx) => {
      const b = await tx.board.create({
        data: { name, description: src.description, color: src.color, clientId: src.clientId, position: (last?.position ?? 0) + 1, favorites: { create: { userId: user.id } } },
      });
      const colMap = new Map<string, string>();
      for (const c of src.columns) {
        const nc = await tx.column.create({ data: { boardId: b.id, name: c.name, color: c.color, isDone: c.isDone, wipLimit: c.wipLimit, position: c.position } });
        colMap.set(c.id, nc.id);
      }
      const cards = src.cards;
      const numbers = await reserveNumbers(tx, cards.length);
      for (const [i, c] of cards.entries()) {
        await tx.card.create({
          data: {
            number: numbers[i],
            title: c.title,
            description: c.description,
            priority: c.priority,
            startDate: c.startDate,
            dueDate: c.dueDate,
            completedAt: c.completedAt,
            coverColor: c.coverColor,
            estimatedMin: c.estimatedMin,
            repeatEvery: c.repeatEvery,
            clientId: c.clientId,
            position: c.position,
            boardId: b.id,
            columnId: colMap.get(c.columnId)!,
            createdById: user.id,
            assignees: { create: c.assignees.map((a) => ({ userId: a.userId })) },
            labels: { create: c.labels.map((l) => ({ labelId: l.labelId })) },
            checklists: { create: c.checklists.map((l) => ({ title: l.title, position: l.position, items: { create: l.items.map((it) => ({ text: it.text, done: it.done, position: it.position })) } })) },
          },
        });
      }
      return b.id;
    });
    revalidatePath("/", "layout");
    return { id: newId };
  });
}

export async function saveBoardTemplate(boardId: string, input: { name: string; withCards: boolean }) {
  return run(async () => {
    const user = await assertUser();
    const name = z.string().trim().min(2, "Dê um nome ao modelo.").max(60).parse(input.name);
    const b = await db.board.findUnique({
      where: { id: id.parse(boardId) },
      include: {
        columns: { where: { archivedAt: null }, orderBy: { position: "asc" } },
        cards: { where: { archivedAt: null, completedAt: null, isTemplate: false, column: { archivedAt: null } }, orderBy: { position: "asc" }, take: 200, include: { labels: true, checklists: { include: { items: { orderBy: { position: "asc" } } } } } },
      },
    });
    if (!b) fail("Quadro não encontrado.");
    const columns: TplColumn[] = b.columns.map((c) => ({ name: c.name, color: c.color, isDone: c.isDone, wipLimit: c.wipLimit }));
    const index = new Map(b.columns.map((c, i) => [c.id, i]));
    const cards: TplCard[] = input.withCards
      ? b.cards.map((c) => ({
          column: index.get(c.columnId) ?? 0,
          title: c.title,
          description: c.description,
          priority: c.priority,
          checklist: c.checklists.flatMap((l) => l.items.map((i) => i.text)).slice(0, 100),
          labelIds: c.labels.map((l) => l.labelId),
        }))
      : [];
    await db.boardTemplate.create({ data: { name, color: b.color, description: b.description, columns: JSON.stringify(columns), cards: JSON.stringify(cards), createdById: user.id } });
  });
}

export async function listBoardTemplates() {
  return run(async () => {
    await assertUser();
    const list = await db.boardTemplate.findMany({ orderBy: { name: "asc" }, take: 100 });
    return list.map((t) => {
      const columns = parseJson<TplColumn[]>(t.columns, []);
      return { id: t.id, name: t.name, color: t.color, columns: columns.map((c) => c.name), cardCount: parseJson<TplCard[]>(t.cards, []).length };
    });
  });
}

export async function deleteBoardTemplate(templateId: string) {
  return run(async () => {
    await assertUser();
    await db.boardTemplate.delete({ where: { id: id.parse(templateId) } });
  });
}

/** Arquiva todas as demandas de uma coluna (ex.: limpar "Concluído" no fim da semana). */
export async function archiveColumnCards(columnId: string) {
  return run(async () => {
    const user = await assertUser();
    const col = await db.column.findUnique({ where: { id: id.parse(columnId) }, select: { id: true, boardId: true } });
    if (!col) fail("Coluna não encontrada.");
    const cards = await db.card.findMany({ where: { columnId: col.id, archivedAt: null }, select: { id: true }, take: 2000 });
    await db.$transaction(async (tx) => {
      await tx.card.updateMany({ where: { id: { in: cards.map((c) => c.id) } }, data: { archivedAt: new Date() } });
      await tx.activity.createMany({ data: cards.map((c) => ({ cardId: c.id, userId: user.id, type: "archived", data: "{}" })) });
    });
    publishBoard(col.boardId, user.id);
    return cards.length;
  });
}
