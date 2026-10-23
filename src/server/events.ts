import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { publish } from "./live";

type Tx = Prisma.TransactionClient | typeof db;

export async function logActivity(tx: Tx, cardId: string, userId: string | null, type: string, data: Record<string, string | number> = {}) {
  await tx.activity.create({ data: { cardId, userId, type, data: JSON.stringify(data) } });
}

/** Avisa as pessoas (nunca quem fez a ação). */
export async function notify(tx: Tx, input: { to: string[]; actorId: string | null; cardId: string | null; type: string; text: string }) {
  const to = [...new Set(input.to)].filter((u) => u && u !== input.actorId);
  if (to.length === 0) return;
  await tx.notification.createMany({
    data: to.map((userId) => ({ userId, actorId: input.actorId, cardId: input.cardId, type: input.type, text: input.text })),
  });
  setTimeout(() => to.forEach((userId) => publish({ type: "notification", userId, actorId: input.actorId, cardId: input.cardId ?? undefined })), 60);
}

export async function audit(actorId: string | null, action: string, detail?: string) {
  await db.auditLog.create({ data: { actorId, action, detail } });
}

/** Próximo número sequencial de demanda (#123). */
export async function nextCardNumber(tx: Tx) {
  // Imports and ordinary creation share this lock, including when an import resumes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
  const last = await tx.card.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}
