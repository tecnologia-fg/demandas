import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { stableHash } from "./import-safety.mjs";
import { hashFile } from "./api-client.mjs";
import { targetId } from "./import-engine.mjs";
import { approvalFlowKey, resolveApprovalFlow } from "../../src/lib/trello/approval-flow.ts";

assert.ok(process.env.DATABASE_URL && process.env.DATABASE_URL === process.env.DIRECT_URL, "Load the explicit destination environment");
const args = process.argv.slice(2);
const value = (key) => { const index = args.indexOf(key); assert.ok(index >= 0 && args[index + 1], `Missing ${key}`); return args[index + 1]; };
const baselinePath = value("--baseline");
const db = new PrismaClient();
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
async function snapshot() {
  const [users, boards, cards, comments, attachments, clients, labels] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true } }),
    db.board.findMany({ include: { columns: { orderBy: { id: "asc" } } } }),
    db.card.findMany({ include: { labels: { orderBy: { labelId: "asc" } }, assignees: { orderBy: { userId: "asc" } } } }),
    db.comment.findMany(), db.attachment.findMany(), db.client.findMany(), db.label.findMany(),
  ]);
  return { users, boards, cards, comments, attachments, clients, labels };
}
try {
  const current = await snapshot();
  if (args.includes("--snapshot")) {
    await writeFile(baselinePath, JSON.stringify(current, null, 2));
    console.log(JSON.stringify({ status: "BASELINE_SAVED", users: current.users.length, existingBoards: current.boards.length, existingCards: current.cards.length }));
  } else {
    const before = await read(baselinePath), root = value("--root"), output = value("--output");
    const indexed = Object.fromEntries(Object.entries(current).map(([table, rows]) => [table, new Map(rows.map((r) => [r.id, r]))]));
    const approvedLiveChanges = args.includes("--approved-live-changes") ? await read(value("--approved-live-changes")) : { status: "approved", deletedTestCardIds: [] };
    assert.equal(approvedLiveChanges.status, "approved");
    for (const id of approvedLiveChanges.deletedTestCardIds) assert.ok(before.cards.some((c) => c.id === id), "Approved deletion must refer to a pre-import test card");
    const preservedLiveChanges = [];
    for (const table of Object.keys(before)) for (const row of before[table]) {
      const actual = indexed[table].get(row.id);
      if (!actual) {
        const cardId = table === "cards" ? row.id : ["attachments", "comments"].includes(table) ? row.cardId : null;
        assert.ok(cardId && approvedLiveChanges.deletedTestCardIds.includes(cardId), `Existing ${table} row missing without user-confirmed deletion`);
        preservedLiveChanges.push({ table, id: row.id, action: "user_confirmed_test_cleanup" });
        continue;
      }
      if (stableHash(actual) !== stableHash(row) && table === "boards" && actual.archivedAt
        && stableHash({ ...actual, archivedAt: row.archivedAt }) === stableHash(row)) {
        // An administrator can archive their test board while the import runs.
        // Accept only that one field, backed by a matching application audit event.
        const proof = await db.auditLog.findFirst({ where: { action: "board.archive", detail: row.name,
          createdAt: { gte: new Date(actual.archivedAt.getTime() - 5000), lte: new Date(actual.archivedAt.getTime() + 5000) },
          actorId: { in: before.users.map((u) => u.id) } }, select: { id: true } });
        assert.ok(proof, "Existing board archive lacks an application audit event");
        preservedLiveChanges.push({ table, id: row.id, field: "archivedAt", auditId: proof.id });
      } else assert.equal(stableHash(actual), stableHash(row), `Existing ${table} row changed`);
    }
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: "trello_20261022_final" } });
    assert.equal(batch.status, "COMPLETED");
    console.log(JSON.stringify({ stage: "baseline_verified" }));
    const plan = batch.plan;
    const records = await db.importedEntity.findMany({ where: { batchId: batch.id } });
    const recordIndex = new Map(records.map((r) => [`${r.kind}:${r.externalId}`, r]));
    const entity = (kind, id) => { const record = recordIndex.get(`${kind}:${id}`); assert.ok(record, `Missing ${kind} provenance`); return record; };
    const manifest = await read(path.join(root, "reports/import-sources.json"));
    let cardsVerified = 0, commentsVerified = 0, mappedCards = 0, links = 0, mappedComments = 0, templates = 0, columns = 0, omittedArchivedEmptyColumns = 0, approvalFlows = 0;
    for (const entry of manifest.boards) {
      const source = await read(path.join(root, entry.file)), choice = plan.boards.find((b) => b.sourceBoardId === source.id);
      const board = indexed.boards.get(entity("board", source.id).targetId); assert.ok(board);
      assert.equal(board.name, choice.name); assert.equal(board.clientId, choice.clientId || null); assert.equal(Boolean(board.archivedAt), source.closed);
      columns += board.columns.length;
      for (const list of source.lists) {
        const mapping = choice.lists.find((l) => l.sourceListId === list.id), record = entity("column", list.id);
        if (mapping.mode === "omit") {
          assert.ok(list.closed && !source.cards.some((c) => c.idList === list.id), "Only archived empty source lists are omitted in this cutover");
          assert.equal(record.targetId, null); assert.equal(record.status, "OMITTED_EMPTY"); omittedArchivedEmptyColumns++;
        } else {
          const column = board.columns.find((c) => c.id === record.targetId); assert.ok(column);
          assert.equal(column.name, mapping.name); assert.equal(column.isDone, mapping.isDone); assert.equal(Boolean(column.archivedAt), mapping.archived);
        }
      }
      if (plan.approvalFlows?.[source.id]) {
        const setting = await db.appSetting.findUniqueOrThrow({ where: { key: approvalFlowKey(board.id) } });
        const flow = JSON.parse(setting.value);
        assert.deepEqual(flow, plan.approvalFlows[source.id]);
        resolveApprovalFlow(flow, board.columns.filter((c) => !c.archivedAt)); approvalFlows++;
      }
      for (const original of source.cards) {
        const card = indexed.cards.get(entity("card", original.id).targetId); assert.ok(card);
        assert.equal(card.title, original.name); assert.equal(card.boardId, board.id); assert.equal(card.clientId, board.clientId);
        assert.equal(card.columnId, entity("column", original.idList).targetId);
        assert.equal(card.isTemplate, Boolean(original.isTemplate)); assert.equal(Boolean(card.archivedAt), original.closed);
        assert.equal(card.dueDate?.toISOString() ?? null, original.due ? new Date(original.due).toISOString() : null);
        assert.equal(card.updatedAt.toISOString(), new Date(original.dateLastActivity).toISOString());
        assert.equal(Boolean(card.completedAt), original.dueComplete);
        const expectedPeople = [...new Set((original.idMembers ?? []).map((id) => choice.people[id]).filter(Boolean))].sort();
        assert.deepEqual(card.assignees.map((a) => a.userId).sort(), expectedPeople);
        assert.deepEqual(card.labels.map((l) => l.labelId).sort(), [...new Set((original.idLabels ?? []).map((id) => choice.labels[id]).filter((id) => id && id !== "__ignore__"))].sort());
        if (expectedPeople.length) mappedCards++; links += expectedPeople.length;
        if (card.isTemplate) templates++; cardsVerified++;
      }
      for (const original of source.actions.filter((a) => a.type === "commentCard")) {
        const comment = indexed.comments.get(entity("comment", original.id).targetId); assert.ok(comment);
        const author = choice.people[original.idMemberCreator ?? original.memberCreator?.id] || null;
        assert.equal(comment.userId, author); assert.equal(comment.cardId, targetId("card", original.data.card.id));
        assert.equal(comment.createdAt.toISOString(), new Date(original.date).toISOString());
        if (author) mappedComments++; commentsVerified++;
      }
    }
    console.log(JSON.stringify({ stage: "cards_comments_verified", cards: cardsVerified, comments: commentsVerified }));
    const attachmentRows = await read(path.join(root, "reports/attachments.json"));
    let verifiedFiles = 0, attachmentBytes = 0;
    for (const original of attachmentRows) {
      const record = entity("attachment", `${original.cardId}:${original.attachmentId}`);
      if (!original.attachmentScope || original.policyReview || original.status !== "downloaded") { assert.equal(record.targetId, null); continue; }
      const file = indexed.attachments.get(record.targetId); assert.ok(file);
      assert.equal(file.cardId, targetId("card", original.cardId)); assert.equal(file.size, original.bytes);
      const actual = await hashFile(path.join(value("--storage"), file.storedName));
      assert.equal(actual.sha256, original.sha256); assert.equal(actual.bytes, original.bytes);
      verifiedFiles++; attachmentBytes += file.size;
      if (verifiedFiles % 250 === 0) console.log(JSON.stringify({ stage: "hashing_storage", filesVerified: verifiedFiles }));
    }
    assert.equal(records.filter((r) => r.kind === "board").length, 33);
    assert.equal(cardsVerified, 3737); assert.equal(commentsVerified, 425); assert.equal(verifiedFiles, 1513);
    const expectedColumns = plan.boards.reduce((sum, b) => sum + b.lists.filter((l) => l.mode === "new").length + (plan.extraApprovalColumns?.[b.sourceBoardId]?.length ?? 0), 0);
    assert.equal(mappedCards, 1491); assert.equal(links, 2335); assert.equal(mappedComments, 298); assert.equal(templates, 69); assert.equal(columns, expectedColumns);
    assert.equal(omittedArchivedEmptyColumns, 20); assert.equal(approvalFlows, 16);
    assert.equal(current.users.length, before.users.length);
    const report = { verifiedAt: new Date().toISOString(), status: "VERIFIED", boards: 33, columns, omittedArchivedEmptyColumns, approvalFlows, cards: cardsVerified, templates, comments: commentsVerified,
      attachments: verifiedFiles, attachmentBytes, cardsWithAssignees: mappedCards, assignmentLinks: links, mappedComments, externalComments: commentsVerified - mappedComments,
      deferredFiles: records.filter((r) => r.status === "BACKUP_ONLY_UNTIL_REVIEW").length,
      acceptedGapCards: records.filter((r) => r.kind === "content-gap" && r.status === "ACCEPTED_ABSENCE").length,
      existingBoardsPreserved: before.boards.length, existingCardsPreserved: before.cards.filter((c) => !approvedLiveChanges.deletedTestCardIds.includes(c.id)).length,
      userConfirmedDeletedTestCards: approvedLiveChanges.deletedTestCardIds.length, existingUsersPreserved: before.users.length, preservedLiveChanges };
    assert.equal(report.deferredFiles, 32); assert.equal(report.acceptedGapCards, 4);
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
} catch (error) {
  if (error.name === "AssertionError") console.error(error.message);
  else console.error(JSON.stringify({ status: "CUTOVER_AUDIT_FAILED", code: error.code ?? error.name }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
