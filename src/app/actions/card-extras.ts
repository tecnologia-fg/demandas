"use server";

import { z } from "zod";
import { unlink } from "fs/promises";
import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { notify } from "@/server/events";
import { rateLimit } from "@/server/rate-limit";
import { toUserLite } from "@/server/serialize";
import { storagePath } from "@/server/storage";
import { fail, id, run } from "@/server/action";
import { mentionIds, richToText, sanitizeRich } from "@/server/richtext";
import { publishBoard } from "@/server/live";

async function cardOrFail(cardId: string) {
  const card = await db.card.findUnique({ where: { id: id.parse(cardId) }, select: { id: true, number: true, title: true, boardId: true, board: { select: { archivedAt: true } } } });
  if (!card || card.board.archivedAt) fail("Demanda não encontrada.");
  return card;
}

/** Demanda dona de uma lista de checklist (recusa quadro arquivado). */
async function cardOfChecklist(checklistId: string) {
  const l = await db.checklist.findUnique({ where: { id: id.parse(checklistId) }, select: { card: { select: { id: true, boardId: true, board: { select: { archivedAt: true } } } } } });
  if (!l || l.card.board.archivedAt) fail("Lista não encontrada.");
  return l.card;
}

async function cardOfItem(itemId: string) {
  const i = await db.checklistItem.findUnique({ where: { id: id.parse(itemId) }, select: { checklistId: true } });
  if (!i) fail("Item não encontrado.");
  return cardOfChecklist(i.checklistId);
}

/** Avisa as telas abertas (atualização ao vivo). */
function changed(card: { id: string; boardId: string }, actorId: string) {
  publishBoard(card.boardId, actorId, card.id);
}

// ---------- Comentários ----------

/** Menções: o editor grava <span data-type="mention" data-id="...">; só valem ids de pessoas ativas. */
async function mentionedUsers(html: string) {
  const ids = mentionIds(html);
  if (ids.length === 0) return [];
  const users = await db.user.findMany({ where: { id: { in: ids.slice(0, 50) }, active: true }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Comentário em HTML limpo; erro se não sobrar texto. */
function cleanComment(body: string) {
  const html = sanitizeRich(z.string().max(60000, "Comentário longo demais.").parse(body));
  if (!richToText(html) && !html.includes("mention")) fail("Escreva o comentário.");
  return html;
}

export async function addComment(cardId: string, body: string) {
  return run(async () => {
    const user = await assertUser();
    if (!rateLimit(`comment:${user.id}`, 20, 60_000).ok) fail("Muitos comentários seguidos. Espere um pouco.");
    const text = cleanComment(body);
    const card = await cardOrFail(cardId);
    const mentions = await mentionedUsers(text);
    return db.$transaction(async (tx) => {
      const c = await tx.comment.create({ data: { cardId: card.id, userId: user.id, body: text }, include: { user: { select: { id: true, name: true, color: true, avatarUrl: true } } } });
      await notify(tx, { to: mentions, actorId: user.id, cardId: card.id, type: "MENTION", text: `${user.name} mencionou você em #${card.number} ${card.title}` });
      const assignees = await tx.cardAssignee.findMany({ where: { cardId: card.id }, select: { userId: true } });
      await notify(tx, {
        to: assignees.map((a) => a.userId).filter((u) => !mentions.includes(u)),
        actorId: user.id,
        cardId: card.id,
        type: "COMMENT",
        text: `${user.name} comentou em #${card.number} ${card.title}`,
      });
      return { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), editedAt: null, user: toUserLite(user) };
    }).then((r) => {
      changed(card, user.id);
      return r;
    });
  });
}

export async function editComment(commentId: string, body: string) {
  return run(async () => {
    const user = await assertUser();
    const text = cleanComment(body);
    const c = await db.comment.findUnique({ where: { id: id.parse(commentId) }, include: { card: { select: { id: true, boardId: true } } } });
    if (!c) fail("Comentário não encontrado.");
    if (c.userId !== user.id) fail("Só quem escreveu pode editar.");
    const updated = await db.comment.update({ where: { id: c.id }, data: { body: text, editedAt: new Date() } });
    changed(c.card, user.id);
    return { body: updated.body, editedAt: updated.editedAt!.toISOString() };
  });
}

export async function deleteComment(commentId: string) {
  return run(async () => {
    const user = await assertUser();
    const c = await db.comment.findUnique({ where: { id: id.parse(commentId) }, include: { card: { select: { id: true, boardId: true } } } });
    if (!c) fail("Comentário não encontrado.");
    if (c.userId !== user.id && !user.isAdmin) fail("Só quem escreveu ou um administrador pode excluir.");
    await db.comment.delete({ where: { id: c.id } });
    changed(c.card, user.id);
  });
}

// ---------- Checklists ----------

const text = (label: string) => z.string().trim().min(1, `Escreva ${label}.`).max(300);

export async function addChecklist(cardId: string, title: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOrFail(cardId);
    const t = text("o nome da lista").parse(title);
    const last = await db.checklist.findFirst({ where: { cardId: card.id }, orderBy: { position: "desc" }, select: { position: true } });
    const l = await db.checklist.create({ data: { cardId: card.id, title: t, position: (last?.position ?? -1) + 1 } });
    changed(card, user.id);
    return { id: l.id, title: l.title, items: [] as { id: string; text: string; done: boolean }[] };
  });
}

export async function renameChecklist(checklistId: string, title: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOfChecklist(checklistId);
    await db.checklist.update({ where: { id: checklistId }, data: { title: text("o nome da lista").parse(title) } });
    changed(card, user.id);
  });
}

export async function deleteChecklist(checklistId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOfChecklist(checklistId);
    await db.checklist.delete({ where: { id: checklistId } });
    changed(card, user.id);
  });
}

export async function addChecklistItem(checklistId: string, value: string) {
  return run(async () => {
    const user = await assertUser();
    const t = text("o item").parse(value);
    const card = await cardOfChecklist(checklistId);
    const last = await db.checklistItem.findFirst({ where: { checklistId }, orderBy: { position: "desc" }, select: { position: true } });
    const item = await db.checklistItem.create({ data: { checklistId, text: t, position: (last?.position ?? -1) + 1 } });
    changed(card, user.id);
    return { id: item.id, text: item.text, done: item.done };
  });
}

export async function updateChecklistItem(itemId: string, patch: { text?: string; done?: boolean }) {
  return run(async () => {
    const user = await assertUser();
    const data = z.object({ text: text("o item").optional(), done: z.boolean().optional() }).parse(patch);
    const card = await cardOfItem(itemId);
    await db.checklistItem.update({ where: { id: itemId }, data });
    changed(card, user.id);
  });
}

export async function deleteChecklistItem(itemId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOfItem(itemId);
    await db.checklistItem.delete({ where: { id: itemId } });
    changed(card, user.id);
  });
}

// ---------- Cronômetro ----------

export async function startTimer(cardId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOrFail(cardId);
    const now = new Date();
    // um cronômetro por pessoa: iniciar aqui pausa o que estiver rodando em outra demanda
    await db.timeEntry.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: now } });
    await db.timeEntry.create({ data: { cardId: card.id, userId: user.id, startedAt: now } });
    changed(card, user.id);
    return now.toISOString();
  });
}

export async function stopTimer(cardId: string) {
  return run(async () => {
    const user = await assertUser();
    const card = await cardOrFail(cardId);
    await db.timeEntry.updateMany({ where: { cardId: card.id, userId: user.id, endedAt: null }, data: { endedAt: new Date() } });
    changed(card, user.id);
  });
}

// ---------- Anexos ----------

export async function deleteAttachment(attachmentId: string) {
  return run(async () => {
    const user = await assertUser();
    const a = await db.attachment.findUnique({ where: { id: id.parse(attachmentId) }, include: { card: { select: { id: true, boardId: true } } } });
    if (!a) fail("Anexo não encontrado.");
    if (a.uploadedById !== user.id && !user.isAdmin) fail("Só quem enviou ou um administrador pode excluir.");
    await db.attachment.delete({ where: { id: a.id } });
    await unlink(storagePath(a.storedName)).catch(() => {});
    changed(a.card, user.id);
  });
}
