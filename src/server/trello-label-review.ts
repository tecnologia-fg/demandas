import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { labelGroups, type SourceLabel, type ReviewCard } from "@/lib/trello/label-review";

const labelSchema = z.object({ name: z.string(), color: z.string().nullable(), idBoard: z.string() });
const cardSchema = z.object({ idLabels: z.array(z.string()) });
type Reader = Pick<Prisma.TransactionClient, "importedEntity" | "label" | "card" | "importBatch">;
export async function labelReviewState(reader: Reader = db) {
  const [records, cardRecords, labels] = await Promise.all([
    reader.importedEntity.findMany({ where: { kind: "label", batch: { source: "trello" } }, orderBy: { id: "asc" } }),
    reader.importedEntity.findMany({ where: { kind: "card", targetId: { not: null }, batch: { source: "trello" } }, select: { targetId: true, original: true } }),
    reader.label.findMany({ orderBy: { id: "asc" } }),
  ]);
  const sources: SourceLabel[] = records.map((record) => ({ ...labelSchema.parse(record.original), id: record.id, externalId: record.externalId, targetId: record.targetId, status: record.status,
    boardId: labelSchema.parse(record.original).idBoard }));
  const originals = new Map(cardRecords.map((record) => [record.targetId!, cardSchema.parse(record.original).idLabels]));
  const current = await reader.card.findMany({ where: { id: { in: [...originals.keys()] } }, select: { id: true, labels: { select: { labelId: true } } }, orderBy: { id: "asc" } });
  const cards: ReviewCard[] = current.map((card) => ({ id: card.id, sourceLabels: originals.get(card.id)!, labels: card.labels.map((label) => label.labelId).sort() }));
  const fingerprint = createHash("sha256").update(JSON.stringify({ sources, cards, labels })).digest("hex");
  return { sources, cards, labels, fingerprint, groups: labelGroups(sources, cards) };
}
