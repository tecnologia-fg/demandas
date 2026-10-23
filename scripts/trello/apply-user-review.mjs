import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/server/auth/password.ts";
import { stableHash } from "./import-safety.mjs";

// This command can only update the existing, isolated Docker rehearsal.
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
assert.equal(process.env.DATABASE_URL, process.env.DIRECT_URL);
const directory = "research/trello/local/rehearsal";
const plan = JSON.parse(await readFile(`${directory}/user-associations.approved.json`, "utf8"));
assert.equal(plan.kind, "dmanda-trello-user-review"); assert.equal(plan.status, "approved");
assert.equal(plan.associations.length, 12); assert.equal(plan.external.length, 87);
assert.equal(new Set(plan.associations.map((a) => a.sourcePersonId)).size, 12);
assert.equal(new Set(plan.associations.map((a) => a.targetUserId)).size, 12);
const mapping = new Map(plan.associations.map((a) => [a.sourcePersonId, a.targetUserId]));
assert.ok(plan.external.every((e) => !mapping.has(e.sourcePersonId)));
const batchId = "trello_users_review_20261023", sourceBatch = "trello_20261022_rehearsal";
const sourceHash = stableHash(plan), db = new PrismaClient();
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
    const prior = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (prior) { assert.equal(prior.sourceHash, sourceHash); assert.equal(prior.status, "APPLIED"); return { status: "ALREADY_APPLIED" }; }
    const source = await tx.importBatch.findUniqueOrThrow({ where: { id: sourceBatch } });
    assert.equal(source.source, "trello"); assert.equal(source.status, "COMPLETED");
    const identities = await tx.importedEntity.findMany({ where: { batchId: sourceBatch, kind: "identity" } });
    assert.equal(identities.length, 99);
    const createdUsers = [];
    for (const choice of plan.associations) {
      const identity = identities.find((r) => r.externalId === choice.sourcePersonId); assert.ok(identity);
      assert.equal(identity.original.fullName, choice.sourceName);
      assert.ok(!identity.targetId || identity.targetId === choice.targetUserId, "Identity already has a different destination");
      const existing = await tx.user.findFirst({ where: { OR: [{ id: choice.targetUserId }, { email: choice.targetEmail }] } });
      if (existing) {
        assert.equal(existing.id, choice.targetUserId); assert.equal(existing.email, choice.targetEmail);
        assert.ok(existing.active, "Existing account inactive; do not reactivate automatically");
      } else {
        // No production password hashes are read or copied. Local accounts are MEMBER.
        await tx.user.create({ data: { id: choice.targetUserId, email: choice.targetEmail, name: choice.targetName,
          passwordHash: hashPassword(randomBytes(32).toString("base64url")), role: "MEMBER", mustChangePassword: true } });
        createdUsers.push(choice.targetUserId);
      }
    }
    const records = await tx.importedEntity.findMany({ where: { batchId: sourceBatch, kind: { in: ["card", "comment"] } } });
    const cards = records.filter((r) => r.kind === "card"), comments = records.filter((r) => r.kind === "comment");
    assert.equal(cards.length, 3737); assert.equal(comments.length, 425);
    const beforeAssignments = await tx.cardAssignee.findMany({ where: { cardId: { in: cards.map((r) => r.targetId) } } });
    const beforeComments = [], assignments = [];
    let mappedCards = 0;
    for (const record of cards) {
      const ids = [...new Set((record.original.idMembers ?? []).map((id) => mapping.get(id)).filter(Boolean))];
      if (ids.length) mappedCards++;
      assignments.push(...ids.map((userId) => ({ cardId: record.targetId, userId })));
    }
    assert.equal(mappedCards, 1491);
    if (assignments.length) await tx.cardAssignee.createMany({ data: assignments, skipDuplicates: true });
    for (const record of comments) {
      const author = record.original.idMemberCreator ?? record.original.memberCreator?.id;
      const target = mapping.get(author); if (!target) continue;
      const comment = await tx.comment.findUniqueOrThrow({ where: { id: record.targetId } });
      assert.ok(!comment.userId || comment.userId === target, "Comment author already changed; preserve it for review");
      beforeComments.push({ id: comment.id, userId: comment.userId });
      await tx.comment.update({ where: { id: comment.id }, data: { userId: target } });
    }
    assert.equal(beforeComments.length, 298);
    const beforeIdentities = [];
    for (const identity of identities) if (mapping.has(identity.externalId)) {
      beforeIdentities.push({ id: identity.id, targetId: identity.targetId, status: identity.status });
      await tx.importedEntity.update({ where: { id: identity.id }, data: { targetId: mapping.get(identity.externalId), status: "MAPPED_BY_USER_REVIEW" } });
    }
    await tx.importBatch.create({ data: { id: batchId, source: "trello-user-review", sourceHash,
      plan: { approved: plan, sourceBatch, beforeAssignments, beforeComments, beforeIdentities, createdUsers }, status: "APPLIED", finishedAt: new Date() } });
    await tx.auditLog.create({ data: { action: "trello.users.review", detail: batchId } });
    return { status: "APPLIED", createdLocalUsers: createdUsers.length, mappedCards, assignmentLinks: assignments.length, mappedComments: beforeComments.length };
  }, { timeout: 120000, maxWait: 120000 });
  // Verify after commit, including a repeat run which must make no changes.
  const identityRows = await db.importedEntity.findMany({ where: { batchId: sourceBatch, kind: "identity" } });
  assert.equal(identityRows.filter((r) => r.targetId).length, 12); assert.equal(identityRows.filter((r) => !r.targetId).length, 87);
  const assigned = await db.cardAssignee.findMany({ where: { userId: { in: [...mapping.values()] } } });
  assert.equal(new Set(assigned.map((a) => a.cardId)).size, 1491);
  const comments = await db.comment.findMany();
  assert.equal(comments.filter((c) => c.userId && [...mapping.values()].includes(c.userId)).length, 298);
  assert.equal(comments.filter((c) => !c.userId).length, 127);
  const report = { checkedAt: new Date().toISOString(), batchId, approvedPlanHash: sourceHash, ...result,
    mappedCards: 1491, assignmentLinks: assigned.length, mappedComments: 298, externalComments: 127, externalIdentities: 87, productionWrites: 0 };
  await writeFile(`${directory}/user-associations-result.json`, JSON.stringify(report, null, 2));
  // Ready to copy into the per-board people maps of the final reviewed plan.
  await writeFile(`${directory}/approved-people-map.json`, JSON.stringify({ kind: "dmanda-trello-approved-people", schemaVersion: 1, people: Object.fromEntries(identityRows.map((r) => [r.externalId, r.targetId ?? ""])),
    approvedPlanHash: createHash("sha256").update(JSON.stringify(plan)).digest("hex") }, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
