import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const root = "research/trello/local/api-capture/2026-10-22/reports";
const decisions = await read("research/trello/migration-decisions.json"), gaps = await read(`${root}/counter-discrepancies.json`);
assert.equal(decisions.policyFiles.decision, "backup_only_until_review"); assert.equal(decisions.missingContent.decision, "accept_and_record");
const db = new PrismaClient(), batchId = "trello_content_decisions_20261023";
try {
  const sourceHash = createHash("sha256").update(JSON.stringify({ decisions, gaps })).digest("hex");
  await db.$transaction(async (tx) => {
    const previous = await tx.importBatch.findUnique({ where: { id: batchId } }); if (previous) { assert.equal(previous.sourceHash, sourceHash); return; }
    const files = await tx.importedEntity.findMany({ where: { batchId: "trello_20261022_rehearsal", kind: "attachment", status: "POLICY_REVIEW" } });
    assert.equal(files.length, 32); assert.ok(files.every((f) => f.original.attachmentScope && f.original.policyReview && !f.targetId));
    await tx.importBatch.create({ data: { id: batchId, source: "trello-content-decisions", sourceHash, plan: decisions, status: "APPLIED", finishedAt: new Date() } });
    await tx.importedEntity.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { status: "BACKUP_ONLY_UNTIL_REVIEW" } });
    for (const gap of gaps) {
      const card = await tx.importedEntity.findFirstOrThrow({ where: { kind: "card", externalId: gap.cardId, batchId: "trello_20261022_rehearsal" } });
      const accepted = gap.attachmentScope || gap.missingComments;
      await tx.importedEntity.create({ data: { batchId, kind: "content-gap", externalId: gap.cardId, targetId: card.targetId,
        status: accepted ? "ACCEPTED_ABSENCE" : "OUT_OF_BINARY_SCOPE", original: { ...gap, recovered: false, decision: accepted ? "accept_and_record" : "metadata_only_by_scope" } } });
    }
    await tx.auditLog.create({ data: { action: "trello.content-decisions", detail: batchId } });
  });
  const report = { recordedAt: new Date().toISOString(), decisions,
    deferredFiles: (await db.importedEntity.findMany({ where: { kind: "attachment", status: "BACKUP_ONLY_UNTIL_REVIEW" } })).map((f) => f.original), gaps };
  await writeFile("research/trello/local/rehearsal/content-decisions.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: "DECISIONS_RECORDED", deferredFiles: report.deferredFiles.length, gapCards: gaps.length }));
} finally { await db.$disconnect(); }
