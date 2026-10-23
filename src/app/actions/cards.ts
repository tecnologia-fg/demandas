"use server";

import { z } from "zod";
import { unlink } from "fs/promises";
import { storagePath } from "@/server/storage";
import { cleanRich } from "@/server/richtext";
import { publishBoard } from "@/server/live";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { assertUser, type CurrentUser } from "@/server/auth/current";
import { cardSummaryInclude, toCardSummary, toUserLite } from "@/server/serialize";
import { logActivity, nextCardNumber, notify } from "@/server/events";
import { fail, hex, id, run } from "@/server/action";
import { PRIORITIES, PRIORITY_META, REPEATS, type Priority } from "@/lib/domain";
import { addDays, fromDayKey, shortDay, toDayKey, todayKey } from "@/lib/dates";
import type { CardDetail } from "@/lib/types";
import { loadPostView } from "@/server/approvals";
import { importOrigin } from "@/lib/trello/import-origin";
import { copyTemplateFiles, loadTrelloTemplate, removeTemplateCopies, TRELLO_TEMPLATE_PREFIX } from "@/server/template-source";

type Tx = Prisma.TransactionClient;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable();

async function findCard(cardId: string) {
  const card = await db.card.findUnique({ where: { id: id.parse(cardId) }, include: { board: { select: { archivedAt: true, name: true } } } });
  if (!card || card.board.archivedAt) fail("Demanda não encontrada.");
  return card;
}

/** Resumo da demanda depois de uma mudança; também avisa as telas abertas (atualização ao vivo). */
async function summary(tx: Tx | typeof db, cardId: string, actorId: string | null = null) {
  const c = await tx.card.findUniqueOrThrow({ where: { id: cardId }, include: cardSummaryInclude });
  // depois do commit da transação (o aviso é só um "recarregue", não leva dados)
  setTimeout(() => publishBoard(c.boardId, actorId, c.id), 60);
  return toCardSummary(c);
}

/** Reescreve as posições de uma coluna na ordem dada (0, 1, 2...). */
async function writeOrder(tx: Tx, columnId: string, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await tx.card.update({ where: { id: orderedIds[i] }, data: { position: i, columnId } });
  }
}

export async function createCard(input: {
  boardId: string;
  columnId: string;
  title: string;
  atTop?: boolean;
  dueDate?: string | null;
  assigneeIds?: string[];
  clientId?: string | null;
  templateId?: string | null;
}) {
  return run(async () => {
    const user = await assertUser();
    const title = z.string().trim().min(1, "Escreva o título da demanda.").max(200).parse(input.title);
    const due = dayKey.optional().parse(input.dueDate ?? null);
    const column = await db.column.findFirst({
      where: { id: id.parse(input.columnId), boardId: id.parse(input.boardId), archivedAt: null, board: { archivedAt: null } },
      include: { board: { select: { clientId: true } } },
    });
    if (!column) fail("Coluna não encontrada.");
    const assigneeIds = await validUsers(input.assigneeIds ?? []);
    // cliente: o escolhido (null = nenhum) ou, se não veio, o padrão do quadro
    const clientId = input.clientId === undefined ? column.board.clientId : input.clientId ? await validClient(input.clientId) : null;
    const sourceTemplate = input.templateId?.startsWith(TRELLO_TEMPLATE_PREFIX) ? await loadTrelloTemplate(input.templateId) : null;
    const template = sourceTemplate ?? (input.templateId && !input.templateId.startsWith(TRELLO_TEMPLATE_PREFIX) ? await db.cardTemplate.findUnique({ where: { id: id.parse(input.templateId) } }) : null);
    if (input.templateId && !template) fail("Modelo indisponível. Atualize a lista de modelos.");
    const savedTemplate = template && "checklist" in template ? template : null;
    const tplChecklist = savedTemplate ? jsonList(savedTemplate.checklist) : [];
    const tplLabels = sourceTemplate ? sourceTemplate.labels.map((l) => l.labelId) : savedTemplate ? (await db.label.findMany({ where: { id: { in: jsonList(savedTemplate.labelIds) } }, select: { id: true } })).map((l) => l.id) : [];
    const files = await copyTemplateFiles(sourceTemplate?.attachments ?? [], user.id);
    let card;
    try { card = await db.$transaction(async (tx) => {
      const number = await nextCardNumber(tx);
      const edge = await tx.card.findFirst({
        where: { columnId: column.id },
        orderBy: { position: input.atTop ? "asc" : "desc" },
        select: { position: true },
      });
      const position = input.atTop ? (edge?.position ?? 0) - 1 : (edge?.position ?? -1) + 1;
      const c = await tx.card.create({
        data: {
          number,
          title,
          boardId: column.boardId,
          columnId: column.id,
          position,
          dueDate: fromDayKey(due),
          createdById: user.id,
          clientId,
          completedAt: column.isDone ? new Date() : null,
          description: template?.description ?? null,
          priority: template?.priority ?? null,
          estimatedMin: template?.estimatedMin ?? null,
          coverColor: sourceTemplate?.coverColor ?? null,
          assignees: { create: assigneeIds.map((userId) => ({ userId })) },
          labels: { create: tplLabels.map((labelId) => ({ labelId })) },
          checklists: sourceTemplate ? { create: sourceTemplate.checklists.map((list) => ({ title: list.title, position: list.position,
            items: { create: list.items.map((item) => ({ text: item.text, position: item.position, done: false })) } })) } : tplChecklist.length
            ? { create: { title: "Checklist", items: { create: tplChecklist.map((text, i) => ({ text, position: i })) } } }
            : undefined,
        },
      });
      for (const file of files) {
        const { sourceId, ...data } = file;
        const attachment = await tx.attachment.create({ data: { ...data, cardId: c.id } });
        if (sourceId === sourceTemplate?.coverAttachmentId) await tx.card.update({ where: { id: c.id }, data: { coverAttachmentId: attachment.id } });
      }
      await logActivity(tx, c.id, user.id, "created", { column: column.name, ...(sourceTemplate ? { templateSourceCardId: sourceTemplate.id } : {}) });
      if (assigneeIds.length) {
        await notify(tx, { to: assigneeIds, actorId: user.id, cardId: c.id, type: "ASSIGNED", text: `${user.name} colocou você em #${number} ${title}` });
      }
      return summary(tx, c.id, user.id);
    }, { timeout: 60000 }); } catch (error) { await removeTemplateCopies(files); throw error; }
    return card;
  });
}

function jsonList(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

async function validClient(clientId: string) {
  const c = await db.client.findFirst({ where: { id: id.parse(clientId), active: true }, select: { id: true } });
  if (!c) fail("Cliente não encontrado.");
  return c.id;
}

async function validUsers(ids: string[]) {
  const list = z.array(id).max(50).parse(ids);
  if (list.length === 0) return [];
  const found = await db.user.findMany({ where: { id: { in: list }, active: true }, select: { id: true } });
  return found.map((u) => u.id);
}

/** Arrastar: põe a demanda na coluna de destino, na posição `toIndex` (entre as não arquivadas). */
export async function moveCard(input: { cardId: string; toColumnId: string; toIndex: number }) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(input.cardId);
    const toIndex = z.number().int().min(0).max(5000).parse(input.toIndex);
    const [from, to] = await Promise.all([
      db.column.findUnique({ where: { id: card.columnId } }),
      db.column.findFirst({ where: { id: id.parse(input.toColumnId), boardId: card.boardId, archivedAt: null } }),
    ]);
    if (!to || !from) fail("Coluna não encontrada.");
    return db.$transaction(async (tx) => {
      const siblings = await tx.card.findMany({
        where: { columnId: to.id, archivedAt: null, id: { not: card.id } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const ordered = siblings.map((s) => s.id);
      ordered.splice(Math.min(toIndex, ordered.length), 0, card.id);
      await writeOrder(tx, to.id, ordered);
      let spawned: Awaited<ReturnType<typeof summary>> | null = null;
      if (from.id !== to.id) {
        await logActivity(tx, card.id, user.id, "moved", { from: from.name, to: to.name });
        spawned = await applyDoneRule(tx, user, card.id, from.isDone, to.isDone);
        const assignees = await tx.cardAssignee.findMany({ where: { cardId: card.id }, select: { userId: true } });
        await notify(tx, { to: assignees.map((a) => a.userId), actorId: user.id, cardId: card.id, type: "MOVED", text: `${user.name} moveu #${card.number} ${card.title} para ${to.name}` });
      }
      return { card: await summary(tx, card.id, user.id), spawned };
    });
  });
}

/** Entrar numa coluna "de concluído" conclui; sair dela reabre. */
async function applyDoneRule(tx: Tx, user: CurrentUser, cardId: string, fromDone: boolean, toDone: boolean) {
  if (toDone && !fromDone) return setCompleted(tx, user, cardId, true);
  if (!toDone && fromDone) return setCompleted(tx, user, cardId, false);
  return null;
}

async function setCompleted(tx: Tx, user: CurrentUser, cardId: string, done: boolean) {
  const card = await tx.card.findUniqueOrThrow({ where: { id: cardId } });
  if (Boolean(card.completedAt) === done) return null;
  await tx.card.update({ where: { id: cardId }, data: { completedAt: done ? new Date() : null } });
  await logActivity(tx, cardId, user.id, done ? "completed" : "reopened");
  if (done && card.repeatEvery && !card.repeatSpawned) return spawnRepeat(tx, user, cardId);
  return null;
}

/** Repetição: ao concluir, cria a próxima demanda na primeira coluna (não concluída) do quadro. */
async function spawnRepeat(tx: Tx, user: CurrentUser, cardId: string) {
  const card = await tx.card.findUniqueOrThrow({
    where: { id: cardId },
    include: { assignees: true, labels: true, checklists: { include: { items: true }, orderBy: { position: "asc" } } },
  });
  const firstColumn = await tx.column.findFirst({ where: { boardId: card.boardId, isDone: false }, orderBy: { position: "asc" } });
  if (!firstColumn) return null;
  const shift = (d: Date | null) => {
    if (!d) return null;
    const key = toDayKey(d)!;
    if (card.repeatEvery === "DAILY") return fromDayKey(addDays(key, 1));
    if (card.repeatEvery === "WEEKLY") return fromDayKey(addDays(key, 7));
    // mês seguinte, limitado ao último dia (31/01 -> 28/02, não 03/03)
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
  };
  const number = await nextCardNumber(tx);
  const top = await tx.card.findFirst({ where: { columnId: firstColumn.id }, orderBy: { position: "asc" }, select: { position: true } });
  const copy = await tx.card.create({
    data: {
      number,
      title: card.title,
      description: card.description,
      priority: card.priority,
      startDate: shift(card.startDate),
      dueDate: shift(card.dueDate) ?? (card.repeatEvery ? fromDayKey(addDays(todayKey(), card.repeatEvery === "DAILY" ? 1 : card.repeatEvery === "WEEKLY" ? 7 : 30)) : null),
      coverColor: card.coverColor,
      estimatedMin: card.estimatedMin,
      repeatEvery: card.repeatEvery,
      clientId: card.clientId,
      boardId: card.boardId,
      columnId: firstColumn.id,
      position: (top?.position ?? 0) - 1,
      createdById: user.id,
      assignees: { create: card.assignees.map((a) => ({ userId: a.userId })) },
      labels: { create: card.labels.map((l) => ({ labelId: l.labelId })) },
      checklists: {
        create: card.checklists.map((l) => ({
          title: l.title,
          position: l.position,
          items: { create: l.items.map((i) => ({ text: i.text, position: i.position })) },
        })),
      },
    },
  });
  await tx.card.update({ where: { id: card.id }, data: { repeatSpawned: true } });
  await logActivity(tx, card.id, user.id, "repeat_spawned", { number });
  await logActivity(tx, copy.id, user.id, "created", { column: firstColumn.name });
  return summary(tx, copy.id, user.id);
}

export async function toggleComplete(cardId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    return db.$transaction(async (tx) => {
      const spawned = await setCompleted(tx, user, card.id, !card.completedAt);
      return { card: await summary(tx, card.id, user.id), spawned };
    });
  });
}

const cardPatch = z.object({
  title: z.string().trim().min(1, "O título não pode ficar vazio.").max(200).optional(),
  description: z.string().max(100000, "Descrição longa demais.").nullable().optional(),
  priority: z.enum(PRIORITIES).nullable().optional(),
  startDate: dayKey.optional(),
  dueDate: dayKey.optional(),
  coverColor: hex.nullable().optional(),
  coverAttachmentId: id.nullable().optional(),
  estimatedMin: z.number().int().min(0).max(100000).nullable().optional(),
  repeatEvery: z.enum(REPEATS).nullable().optional(),
});

export async function updateCard(cardId: string, patch: z.input<typeof cardPatch>) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    const p = cardPatch.parse(patch);
    const data: Prisma.CardUpdateInput = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.description !== undefined) data.description = cleanRich(p.description);
    if (p.priority !== undefined) data.priority = p.priority;
    if (p.startDate !== undefined) data.startDate = fromDayKey(p.startDate);
    if (p.dueDate !== undefined) data.dueDate = fromDayKey(p.dueDate);
    if (p.coverColor !== undefined) data.coverColor = p.coverColor;
    if (p.coverAttachmentId !== undefined) {
      if (p.coverAttachmentId) {
        const a = await db.attachment.findFirst({ where: { id: p.coverAttachmentId, cardId: card.id }, select: { mime: true } });
        if (!a || !a.mime.startsWith("image/") || a.mime.includes("photoshop") || a.mime.includes("heic")) fail("Escolha uma imagem dos anexos desta demanda.");
      }
      data.coverAttachment = p.coverAttachmentId ? { connect: { id: p.coverAttachmentId } } : { disconnect: true };
    }
    if (p.estimatedMin !== undefined) data.estimatedMin = p.estimatedMin;
    if (p.repeatEvery !== undefined && p.repeatEvery !== card.repeatEvery) {
      data.repeatEvery = p.repeatEvery;
      data.repeatSpawned = false;
    }
    const start = p.startDate !== undefined ? p.startDate : toDayKey(card.startDate);
    const due = p.dueDate !== undefined ? p.dueDate : toDayKey(card.dueDate);
    if (start && due && start > due) fail("O início não pode ser depois do prazo.");
    return db.$transaction(async (tx) => {
      await tx.card.update({ where: { id: card.id }, data });
      if (p.title !== undefined && p.title !== card.title) await logActivity(tx, card.id, user.id, "renamed", { to: p.title });
      if (p.dueDate !== undefined && p.dueDate !== toDayKey(card.dueDate)) {
        await logActivity(tx, card.id, user.id, "due", { to: p.dueDate ? shortDay(p.dueDate) : "" });
      }
      if (p.priority !== undefined && p.priority !== card.priority) {
        await logActivity(tx, card.id, user.id, "priority", { to: p.priority ? PRIORITY_META[p.priority as Priority].label : "" });
      }
      return summary(tx, card.id, user.id);
    });
  });
}

export async function setAssignees(cardId: string, userIds: string[]) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    const next = await validUsers(userIds);
    const current = (await db.cardAssignee.findMany({ where: { cardId: card.id }, include: { user: { select: { id: true, name: true } } } }));
    const currentIds = current.map((a) => a.userId);
    const added = next.filter((u) => !currentIds.includes(u));
    const removed = current.filter((a) => !next.includes(a.userId));
    return db.$transaction(async (tx) => {
      if (removed.length) await tx.cardAssignee.deleteMany({ where: { cardId: card.id, userId: { in: removed.map((r) => r.userId) } } });
      if (added.length) await tx.cardAssignee.createMany({ data: added.map((userId) => ({ cardId: card.id, userId })) });
      const names = added.length ? await tx.user.findMany({ where: { id: { in: added } }, select: { id: true, name: true } }) : [];
      for (const u of names) await logActivity(tx, card.id, user.id, "assigned", { name: u.name });
      for (const r of removed) await logActivity(tx, card.id, user.id, "unassigned", { name: r.user.name });
      await notify(tx, { to: added, actorId: user.id, cardId: card.id, type: "ASSIGNED", text: `${user.name} colocou você em #${card.number} ${card.title}` });
      return summary(tx, card.id, user.id);
    });
  });
}

export async function setClient(cardId: string, clientId: string | null) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    const next = clientId ? await validClient(clientId) : null;
    return db.$transaction(async (tx) => {
      await tx.card.update({ where: { id: card.id }, data: { clientId: next } });
      const name = next ? (await tx.client.findUnique({ where: { id: next }, select: { name: true } }))?.name ?? "" : "";
      await logActivity(tx, card.id, user.id, "client", { name });
      return summary(tx, card.id, user.id);
    });
  });
}

export async function setLabels(cardId: string, labelIds: string[]) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    const list = z.array(id).max(30).parse(labelIds);
    const valid = await db.label.findMany({ where: { id: { in: list } }, select: { id: true } });
    return db.$transaction(async (tx) => {
      await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
      if (valid.length) await tx.cardLabel.createMany({ data: valid.map((l) => ({ cardId: card.id, labelId: l.id })) });
      return summary(tx, card.id, user.id);
    });
  });
}

export async function archiveCard(cardId: string, archived: boolean) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    return db.$transaction(async (tx) => {
      await tx.card.update({ where: { id: card.id }, data: { archivedAt: archived ? new Date() : null } });
      if (!archived) {
        // volta para a posição que tinha (a posição não muda ao arquivar)
        const siblings = await tx.card.findMany({
          where: { columnId: card.columnId, archivedAt: null, id: { not: card.id } },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        const ordered = siblings.map((x) => x.id);
        ordered.splice(Math.max(0, Math.min(card.position, ordered.length)), 0, card.id);
        await writeOrder(tx, card.columnId, ordered);
      }
      await logActivity(tx, card.id, user.id, archived ? "archived" : "restored");
      return summary(tx, card.id, user.id);
    });
  });
}

export async function deleteCard(cardId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    if (!user.isAdmin && card.createdById !== user.id) fail("Só quem criou a demanda ou um administrador pode excluir. Você pode arquivar.");
    const files = await db.attachment.findMany({ where: { cardId: card.id }, select: { storedName: true } });
    await db.card.delete({ where: { id: card.id } });
    publishBoard(card.boardId, user.id, card.id);
    await Promise.all(files.map((f) => unlink(storagePath(f.storedName)).catch(() => {})));
  });
}

export async function duplicateCard(cardId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await db.card.findUnique({
      where: { id: id.parse(cardId) },
      include: { assignees: true, labels: true, checklists: { include: { items: true } } },
    });
    if (!card) fail("Demanda não encontrada.");
    return db.$transaction(async (tx) => {
      const number = await nextCardNumber(tx);
      const copy = await tx.card.create({
        data: {
          number,
          title: `${card.title} (cópia)`.slice(0, 200),
          description: card.description,
          priority: card.priority,
          startDate: card.startDate,
          dueDate: card.dueDate,
          coverColor: card.coverColor,
          estimatedMin: card.estimatedMin,
          clientId: card.clientId,
          boardId: card.boardId,
          columnId: card.columnId,
          position: card.position,
          createdById: user.id,
          assignees: { create: card.assignees.map((a) => ({ userId: a.userId })) },
          labels: { create: card.labels.map((l) => ({ labelId: l.labelId })) },
          checklists: {
            create: card.checklists.map((l) => ({
              title: l.title,
              position: l.position,
              items: { create: l.items.map((i) => ({ text: i.text, position: i.position })) },
            })),
          },
        },
      });
      // abre espaço logo abaixo da original
      const siblings = await tx.card.findMany({ where: { columnId: card.columnId, archivedAt: null, id: { not: copy.id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
      const ordered = siblings.map((s) => s.id);
      ordered.splice(ordered.indexOf(card.id) + 1, 0, copy.id);
      await writeOrder(tx, card.columnId, ordered);
      await logActivity(tx, copy.id, user.id, "duplicated", { number: card.number });
      return summary(tx, copy.id, user.id);
    });
  });
}

export async function moveCardToBoard(cardId: string, boardId: string, columnId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await findCard(cardId);
    const column = await db.column.findFirst({ where: { id: id.parse(columnId), boardId: id.parse(boardId), archivedAt: null, board: { archivedAt: null } }, include: { board: true } });
    if (!column) fail("Escolha o quadro e a coluna de destino.");
    const fromColumn = await db.column.findUniqueOrThrow({ where: { id: card.columnId } });
    return db.$transaction(async (tx) => {
      const last = await tx.card.findFirst({ where: { columnId: column.id }, orderBy: { position: "desc" }, select: { position: true } });
      await tx.card.update({ where: { id: card.id }, data: { boardId: column.boardId, columnId: column.id, position: (last?.position ?? -1) + 1 } });
      if (column.boardId !== card.boardId) await logActivity(tx, card.id, user.id, "moved_board", { from: card.board.name, to: column.board.name });
      else await logActivity(tx, card.id, user.id, "moved", { from: fromColumn.name, to: column.name });
      const spawned = await applyDoneRule(tx, user, card.id, fromColumn.isDone, column.isDone);
      if (column.boardId !== card.boardId) setTimeout(() => publishBoard(card.boardId, user.id, card.id), 60);
      return { card: await summary(tx, card.id, user.id), spawned };
    });
  });
}

export async function getCardDetail(cardId: string) {
  return run(async (): Promise<CardDetail> => {
    const user = await assertUser();
    const c = await db.card.findUnique({
      where: { id: id.parse(cardId) },
      include: {
        ...cardSummaryInclude,
        board: { select: { name: true, archivedAt: true, columns: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, isDone: true } } } },
        column: { select: { name: true } },
        createdBy: { select: { id: true, name: true, color: true, avatarUrl: true } },
        checklists: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } },
        comments: { orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { id: true, name: true, color: true, avatarUrl: true } } } },
        attachments: { orderBy: { createdAt: "desc" }, take: 100, include: { uploadedBy: { select: { name: true } } } },
        activities: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { id: true, name: true, color: true, avatarUrl: true } } } },
        timeEntries: { select: { startedAt: true, endedAt: true, userId: true } },
      },
    });
    if (!c || c.board.archivedAt) fail("Demanda não encontrada.");
    const base = toCardSummary({ ...c, timeEntries: c.timeEntries.filter((t) => !t.endedAt).map(() => ({ id: "" })) });
    const now = Date.now();
    const spent = c.timeEntries.reduce((sum, t) => sum + ((t.endedAt?.getTime() ?? now) - t.startedAt.getTime()), 0);
    const mine = c.timeEntries.find((t) => t.userId === user.id && !t.endedAt);
    const post = await db.approvalPost.findUnique({ where: { cardId: c.id }, select: { id: true } });
    const approvalPost = post ? await loadPostView(post.id) : null;
    const imported = await db.importedEntity.findFirst({ where: { kind: "card", targetId: c.id, batch: { source: "trello" } }, select: { original: true } });
    return {
      ...base,
      trelloOrigin: imported ? importOrigin(imported.original) : null,
      description: c.description,
      estimatedMin: c.estimatedMin,
      boardName: c.board.name,
      columnName: c.column.name,
      boardColumns: c.board.columns,
      createdBy: c.createdBy ? toUserLite(c.createdBy) : null,
      checklists: c.checklists.map((l) => ({ id: l.id, title: l.title, items: l.items.map((i) => ({ id: i.id, text: i.text, done: i.done })) })),
      comments: c.comments.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), editedAt: m.editedAt?.toISOString() ?? null, user: toUserLite(m.user ?? { id: `trello:${m.externalAuthorId ?? m.id}`, name: `${m.externalAuthorName ?? "Autor desconhecido"} (Trello)`, color: "#64748b" }) })),
      attachments: c.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt.toISOString(), uploadedBy: a.uploadedBy?.name ?? null })),
      activities: c.activities.map((a) => ({
        id: a.id,
        type: a.type,
        data: safeJson(a.data),
        createdAt: a.createdAt.toISOString(),
        user: a.user ? toUserLite(a.user) : null,
      })),
      timeSpentMin: Math.round(spent / 60000),
      myTimerStartedAt: mine?.startedAt.toISOString() ?? null,
      approvalPost,
    };
  });
}

function safeJson(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Acha a demanda pelo número (#123) para links diretos. */
export async function findCardByNumber(n: number) {
  return run(async () => {
    await assertUser();
    const card = await db.card.findUnique({ where: { number: z.number().int().positive().parse(n) }, select: { id: true, boardId: true } });
    if (!card) fail("Demanda não encontrada.");
    return card;
  });
}
