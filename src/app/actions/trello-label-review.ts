"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin } from "@/server/auth/current";
import { fail, run } from "@/server/action";
import { labelReviewState } from "@/server/trello-label-review";
import { remapCardLabels } from "@/lib/trello/label-review";
import type { Prisma } from "@prisma/client";

const schema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), decisions: z.array(z.object({
  group: z.string().max(200), mode: z.enum(["keep", "existing", "new", "ignore"]), targetId: z.string().max(100), name: z.string().max(80), color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
})).max(1000) });
const object = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const route = "/configuracoes/importar-trello/etiquetas";
export async function applyTrelloLabelReview(input: z.input<typeof schema>) {
  return run(async () => {
    const actor = await assertAdmin();
    const data = schema.parse(input);
    const decisions = data.decisions.filter((decision) => decision.mode !== "keep");
    if (!decisions.length) fail("Escolha ao menos uma associação para aplicar.");
    if (new Set(decisions.map((decision) => decision.group)).size !== decisions.length) fail("Grupo repetido.");
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(23102026)`;
      const state = await labelReviewState(tx);
      if (state.fingerprint !== data.fingerprint) fail("As etiquetas ou os cards mudaram. Recarregue e revise novamente.");
      const before = new Map(state.sources.map((source) => [source.externalId, source.targetId]));
      const after = new Map(before), changed = new Set<string>(), created = [], beforeRecords = [];
      for (const decision of decisions) {
        const group = state.groups.find((group) => group.key === decision.group);
        if (!group) fail("Grupo de origem indisponível.");
        let target: string | null = null;
        if (decision.mode === "existing") {
          if (!state.labels.some((label) => label.id === decision.targetId)) fail("Etiqueta de destino indisponível.");
          target = decision.targetId;
        } else if (decision.mode === "new") {
          if (!decision.name.trim() || decision.name.trim().length > 40) fail("Informe nome de etiqueta com até 40 caracteres.");
          const label = await tx.label.create({ data: { name: decision.name.trim(), color: decision.color } }); target = label.id; created.push(label.id);
        }
        for (const sourceId of group.sourceIds) {
          changed.add(sourceId); after.set(sourceId, target);
          const source = state.sources.find((source) => source.externalId === sourceId)!;
          beforeRecords.push({ id: source.id, targetId: source.targetId, status: source.status });
          await tx.importedEntity.update({ where: { id: source.id }, data: { targetId: target, status: target ? "MAPPED" : "IGNORED" } });
        }
      }
      const affected = state.cards.filter((card) => card.sourceLabels.some((sourceId) => changed.has(sourceId)));
      const afterCards = affected.map((card) => ({ id: card.id, labels: remapCardLabels(card, before, after, changed) }));
      for (const card of afterCards) {
        await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
        if (card.labels.length) await tx.cardLabel.createMany({ data: card.labels.map((labelId) => ({ cardId: card.id, labelId })), skipDuplicates: true });
      }
      // Remove only unused labels proven to have been created by this import.
      const oldTargets = [...new Set(beforeRecords.map((record) => record.targetId).filter((id): id is string => Boolean(id)))];
      const deleted = [];
      const [cardTemplates, boardTemplates] = await Promise.all([tx.cardTemplate.findMany({ select: { labelIds: true } }), tx.boardTemplate.findMany({ select: { cards: true } })]);
      for (const id of oldTargets) {
        if (cardTemplates.some((template) => template.labelIds.includes(id)) || boardTemplates.some((template) => template.cards.includes(id))) continue;
        if (!id.startsWith("tr_") || await tx.cardLabel.count({ where: { labelId: id } }) || await tx.importedEntity.count({ where: { kind: "label", targetId: id } })) continue;
        const label = state.labels.find((label) => label.id === id); if (!label) continue;
        deleted.push(label); await tx.label.delete({ where: { id } });
      }
      const next = await labelReviewState(tx);
      const review = await tx.importBatch.create({ data: { id: crypto.randomUUID(), source: "trello-label-review", sourceHash: state.fingerprint, status: "APPLIED", finishedAt: new Date(),
        plan: object({ decisions, beforeRecords, beforeCards: affected.map((card) => ({ id: card.id, labels: card.labels })), afterCards, created, deleted, afterFingerprint: next.fingerprint }) } });
      await tx.auditLog.create({ data: { action: "trello.labels.review", actorId: actor.id, detail: review.id } });
      return { reviewId: review.id, cards: affected.length, labelsRemoved: deleted.length };
    }, { timeout: 120000, isolationLevel: "Serializable" });
    revalidatePath(route); revalidatePath("/configuracoes"); return result;
  });
}

const backupSchema = z.object({ afterFingerprint: z.string(), beforeRecords: z.array(z.object({ id: z.string(), targetId: z.string().nullable(), status: z.string() })),
  beforeCards: z.array(z.object({ id: z.string(), labels: z.array(z.string()) })), created: z.array(z.string()),
  deleted: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), position: z.number() })) });
export async function undoTrelloLabelReview(reviewId: string) {
  return run(async () => {
    const actor = await assertAdmin();
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(23102026)`;
      const latest = await tx.importBatch.findFirst({ where: { source: "trello-label-review", status: "APPLIED" }, orderBy: { startedAt: "desc" } });
      if (!latest || latest.id !== reviewId) fail("Somente a última revisão aplicada pode ser desfeita.");
      const backup = backupSchema.parse(latest.plan);
      const state = await labelReviewState(tx);
      if (state.fingerprint !== backup.afterFingerprint) fail("As etiquetas mudaram depois desta revisão. Recarregue e revise antes de desfazer.");
      for (const label of backup.deleted) await tx.label.create({ data: label });
      for (const record of backup.beforeRecords) await tx.importedEntity.update({ where: { id: record.id }, data: { targetId: record.targetId, status: record.status } });
      for (const card of backup.beforeCards) {
        await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
        if (card.labels.length) await tx.cardLabel.createMany({ data: card.labels.map((labelId) => ({ cardId: card.id, labelId })) });
      }
      const [cardTemplates, boardTemplates] = await Promise.all([tx.cardTemplate.findMany({ select: { labelIds: true } }), tx.boardTemplate.findMany({ select: { cards: true } })]);
      for (const id of backup.created) {
        // Templates can be saved after the review, without changing its fingerprint.
        if (cardTemplates.some((t) => t.labelIds.includes(id)) || boardTemplates.some((t) => t.cards.includes(id))) continue;
        if (!await tx.cardLabel.count({ where: { labelId: id } }) && !await tx.importedEntity.count({ where: { kind: "label", targetId: id } })) await tx.label.delete({ where: { id } });
      }
      await tx.importBatch.update({ where: { id: reviewId }, data: { status: "REVERTED" } });
      await tx.auditLog.create({ data: { action: "trello.labels.undo", actorId: actor.id, detail: reviewId } });
    }, { timeout: 120000, isolationLevel: "Serializable" });
    revalidatePath(route); revalidatePath("/configuracoes");
  });
}

export async function exportTrelloLabelAssociations() {
  return run(async () => {
    await assertAdmin();
    const state = await labelReviewState();
    return { kind: "dmanda-trello-label-associations", schemaVersion: 1, exportedAt: new Date().toISOString(), fingerprint: state.fingerprint,
      associations: state.sources.map((source) => ({ sourceLabelId: source.externalId, sourceBoardId: source.boardId, sourceName: source.name, sourceColor: source.color,
        action: source.targetId ? "associate" : "ignore", target: state.labels.find((label) => label.id === source.targetId) ?? null })) };
  });
}
