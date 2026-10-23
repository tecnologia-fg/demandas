import "server-only";
import { randomBytes } from "crypto";
import { copyFile, mkdir } from "fs/promises";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logActivity } from "./events";
import { STORAGE_DIR, extOf, storagePath } from "./storage";
import type { ApprovalFormat, ApprovalPostView, ApprovalRound, ApprovalStatus, PortalPost } from "@/lib/types";
import { approvalFlowKey, resolveApprovalFlow } from "@/lib/trello/approval-flow";
import { ActionError } from "./auth/current";

type Tx = Prisma.TransactionClient;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const newToken = () => randomBytes(24).toString("base64url");
export const validToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);
export const isApprovalMedia = (mime: string) => (mime.startsWith("image/") && !mime.includes("photoshop") && !mime.includes("heic")) || mime === "video/mp4" || mime === "video/quicktime" || mime === "video/webm";

/** Coluna de aprovação do quadro (a primeira não concluída com "aprova" no nome), a seguinte e a de volta (produção). */
export async function approvalColumns(tx: Tx, boardId: string) {
  const cols = await tx.column.findMany({ where: { boardId, archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, isDone: true } });
  const configured = await tx.appSetting.findUnique({ where: { key: approvalFlowKey(boardId) } });
  if (configured) {
    try { return resolveApprovalFlow(JSON.parse(configured.value), cols); }
    catch (error) { throw new ActionError((error as Error).message); }
  }
  if (await tx.importedEntity.findFirst({ where: { kind: "board", targetId: boardId, batch: { source: "trello" } } })) {
    throw new ActionError("Configure os destinos em Configurações → Importar Trello → Destinos de aprovação antes de usar o portal neste quadro.");
  }
  const i = cols.findIndex((c) => !c.isDone && norm(c.name).includes("aprova"));
  const done = cols.find((c) => c.isDone && norm(c.name).includes("publica")) ?? cols.find((c) => c.isDone) ?? null;
  if (i < 0) return { approval: null, next: null, back: null, done };
  const next = cols[i + 1] && !cols[i + 1].isDone ? cols[i + 1] : null;
  const before = cols.slice(0, i);
  const back = [...before].reverse().find((c) => norm(c.name).includes("produ")) ?? before[before.length - 1] ?? null;
  return { approval: cols[i], next, back, done };
}

/** Move a demanda para o fim de uma coluna do mesmo quadro e registra no histórico. */
export async function moveCardTo(tx: Tx, card: { id: string; columnId: string }, from: { name: string }, to: { id: string; name: string; isDone?: boolean }, userId: string | null) {
  if (card.columnId === to.id) return;
  const last = await tx.card.findFirst({ where: { columnId: to.id }, orderBy: { position: "desc" }, select: { position: true } });
  await tx.card.update({ where: { id: card.id }, data: { columnId: to.id, position: (last?.position ?? -1) + 1, ...(to.isDone ? { completedAt: new Date() } : {}) } });
  await logActivity(tx, card.id, userId, "moved", { from: from.name, to: to.name });
}

export async function ensureClientToken(tx: Tx, clientId: string) {
  const c = await tx.client.findUnique({ where: { id: clientId }, select: { approvalToken: true } });
  if (c?.approvalToken) return c.approvalToken;
  const token = newToken();
  await tx.client.update({ where: { id: clientId }, data: { approvalToken: token } });
  return token;
}

/** Copia um anexo da demanda para a aprovação (o arquivo da aprovação é independente do anexo). */
export async function copyAttachmentFile(a: { name: string; storedName: string; mime: string; size: number }, userId: string) {
  const storedName = `${randomBytes(16).toString("hex")}.${extOf(a.storedName) || "bin"}`;
  await mkdir(STORAGE_DIR, { recursive: true });
  await copyFile(storagePath(a.storedName), storagePath(storedName));
  return { name: a.name, storedName, mime: a.mime, size: a.size, uploadedById: userId };
}

const roundSelect = {
  id: true, round: true, status: true, format: true, caption: true, note: true, sentAt: true, sentById: true, decidedAt: true, decidedBy: true, clientComment: true, changeTargets: true,
  files: { orderBy: { position: "asc" }, select: { id: true, name: true, mime: true } },
} satisfies Prisma.ApprovalSelect;

export const postSelect = {
  id: true, token: true, title: true, format: true, status: true, publishAt: true, createdAt: true, updatedAt: true,
  client: { select: { id: true, name: true, color: true, imageUrl: true, approvalToken: true } },
  card: { select: { id: true, number: true, boardId: true, board: { select: { name: true } } } },
  rounds: { orderBy: { round: "desc" }, take: 30, select: roundSelect },
  messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, author: true, name: true, body: true, createdAt: true } },
} satisfies Prisma.ApprovalPostSelect;

type PostRow = Prisma.ApprovalPostGetPayload<{ select: typeof postSelect }>;

function parseTargets(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 21) : [];
  } catch {
    return [];
  }
}

export function toRound(r: PostRow["rounds"][number], senders: Map<string, string>): ApprovalRound {
  return {
    id: r.id, round: r.round, status: r.status as ApprovalRound["status"], format: r.format as ApprovalFormat, caption: r.caption, note: r.note,
    media: r.files.map((f) => ({ id: f.id, name: f.name, video: f.mime.startsWith("video/") })),
    sentAt: r.sentAt.toISOString(), sentBy: r.sentById ? senders.get(r.sentById) ?? null : null,
    decidedAt: r.decidedAt?.toISOString() ?? null, decidedBy: r.decidedBy, clientComment: r.clientComment, changeTargets: parseTargets(r.changeTargets),
  };
}

export async function toPostViews(rows: PostRow[]): Promise<ApprovalPostView[]> {
  const ids = [...new Set(rows.flatMap((p) => p.rounds.map((r) => r.sentById)).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const senders = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((p) => ({
    id: p.id, token: p.token, title: p.title, format: p.format as ApprovalFormat, status: p.status as ApprovalStatus | "CANCELED",
    publishAt: p.publishAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    client: { id: p.client.id, name: p.client.name, color: p.client.color, imageUrl: p.client.imageUrl, token: p.client.approvalToken },
    card: p.card ? { id: p.card.id, number: p.card.number, boardId: p.card.boardId, boardName: p.card.board.name } : null,
    rounds: p.rounds.map((r) => toRound(r, senders)),
    messages: p.messages.map((m) => ({ id: m.id, author: m.author as "CLIENT" | "TEAM", name: m.name, body: m.body, createdAt: m.createdAt.toISOString() })),
  }));
}

export async function loadPostView(postId: string): Promise<ApprovalPostView | null> {
  const row = await db.approvalPost.findUnique({ where: { id: postId }, select: postSelect });
  return row ? (await toPostViews([row]))[0] : null;
}

/** Arquivos enviados para a aprovação e nunca usados somem depois de 1 dia (só o registro: o disco é limpo junto). */
export async function cleanupStagedFiles() {
  const old = await db.approvalFile.findMany({ where: { approvalId: null, createdAt: { lt: new Date(Date.now() - 86400_000) } }, select: { id: true, storedName: true }, take: 200 });
  if (!old.length) return;
  await db.approvalFile.deleteMany({ where: { id: { in: old.map((f) => f.id) }, approvalId: null } });
  const { unlink } = await import("fs/promises");
  for (const f of old) {
    const still = await db.approvalFile.count({ where: { storedName: f.storedName } });
    if (!still) await unlink(storagePath(f.storedName)).catch(() => {});
  }
}

export const portalSelect = {
  id: true, title: true, format: true, status: true, publishAt: true, updatedAt: true,
  rounds: { orderBy: { round: "desc" }, take: 1, select: roundSelect },
  messages: { orderBy: { createdAt: "asc" }, take: 200, select: { id: true, author: true, name: true, body: true, createdAt: true } },
} satisfies Prisma.ApprovalPostSelect;

type PortalRow = Prisma.ApprovalPostGetPayload<{ select: typeof portalSelect }>;

/** Posts como o cliente vê (sem nomes internos da equipe nas versões). */
export function toPortalPosts(rows: PortalRow[]): PortalPost[] {
  const out: PortalPost[] = [];
  for (const p of rows) {
    const r = p.rounds[0];
    if (!r) continue;
    const round = toRound(r, new Map());
    out.push({
      id: p.id, title: p.title, format: p.format as ApprovalFormat, status: p.status as ApprovalStatus, publishAt: p.publishAt?.toISOString() ?? null,
      round: round.round, caption: round.caption, note: round.note, media: round.media, sentAt: round.sentAt, decidedAt: round.decidedAt, decidedBy: round.decidedBy,
      clientComment: round.clientComment, changeTargets: round.changeTargets,
      messages: p.messages.map((m) => ({ id: m.id, author: m.author as "CLIENT" | "TEAM", name: m.author === "TEAM" ? m.name.split(" ")[0] : m.name, body: m.body, createdAt: m.createdAt.toISOString() })),
    });
  }
  return out;
}
