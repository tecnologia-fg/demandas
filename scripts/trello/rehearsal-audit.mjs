import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashFile } from "./api-client.mjs";

assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const db = new PrismaClient();
const root = path.resolve("research/trello/local/api-capture/2026-10-22");
const output = path.resolve("research/trello/local/rehearsal");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const ordered = (items) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
const sameDate = (actual, expected) => assert.equal(actual?.toISOString() ?? null, expected ? new Date(expected).toISOString() : null);
const provenance = (value) => JSON.parse(JSON.stringify(value, (_, item) => typeof item === "number" && !Number.isSafeInteger(item) ? String(item) : item));
async function run() {
  if (process.argv.includes("--rollback-only")) {
    assert.equal(await db.board.count({ where: { name: "Magik" } }), 0);
    assert.equal(await db.importedEntity.count({ where: { externalId: "69c6c181df2f45ff5c4cf8d3" } }), 0);
    assert.equal(await db.card.count(), 161 + 378 + 29);
    const result = { rollbackVerifiedAt: new Date().toISOString(), completeBoards: await db.board.count(), failedBoardEntities: 0, cards: await db.card.count() };
    await writeFile(path.join(output, "rollback-test.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  const manifest = await read(path.join(root, "reports/import-sources.json"));
  let attachmentRows = await read(path.join(root, "reports/attachments.json"));
  let sources = await Promise.all(manifest.boards.map((board) => read(path.join(root, board.file))));
  const records = await db.importedEntity.findMany();
  const map = new Map(records.map((item) => [`${item.kind}:${item.externalId}`, item]));
  const target = (kind, id) => { const value = map.get(`${kind}:${id}`)?.targetId; assert.ok(value, `Missing ${kind} target`); return value; };
  const boards = await db.board.findMany({ include: { columns: true } });
  if (process.argv.includes("--pilot")) {
    sources = sources.filter((board) => map.has(`board:${board.id}`));
    attachmentRows = attachmentRows.filter((attachment) => sources.some((board) => board.id === attachment.boardId));
  }
  const cards = await db.card.findMany({ include: { labels: true, assignees: true } });
  const comments = await db.comment.findMany();
  const files = await db.attachment.findMany();
  if (!process.argv.includes("--pilot")) {
    const spmar = await db.client.findFirstOrThrow({ where: { name: "SPMAR" }, include: { boards: true } });
    assert.equal(spmar.boards.length, 2); assert.notEqual(spmar.boards[0].id, spmar.boards[1].id);
    assert.deepEqual(spmar.boards.map((board) => board.name).sort(), ["SPMAR", "SPMAR - Complexo Alto do Tietê"].sort());
    assert.equal(cards.filter((card) => card.clientId === spmar.id).length, 142);
  }
  assert.equal(boards.length, sources.length);
  assert.equal(cards.length, sources.reduce((sum, board) => sum + board.cards.length, 0));
  assert.equal(comments.length, sources.reduce((sum, board) => sum + board.actions.filter((action) => action.type === "commentCard").length, 0));
  const identityMappings = new Map(records.filter((r) => r.kind === "identity" && r.targetId).map((r) => [r.externalId, r.targetId]));
  assert.equal(await db.user.count(), 1 + new Set(identityMappings.values()).size);
  assert.equal(await db.notification.count(), 0); assert.equal(await db.approvalPost.count(), 0); assert.equal(await db.approval.count(), 0);
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
  for (const source of sources) {
    assert.deepEqual(map.get(`board:${source.id}`).original, provenance(source));
    const board = boards.find((item) => item.id === target("board", source.id));
    assert.ok(board); assert.equal(board.name, source.name); assert.equal(Boolean(board.archivedAt), source.closed);
    const flowColumns = records.filter((r) => r.kind === "approval-column" && r.original.sourceBoardId === source.id);
    assert.equal(board.columns.length, source.lists.length + flowColumns.length);
    for (const extra of flowColumns) {
      const column = board.columns.find((c) => c.id === extra.targetId); assert.ok(column); assert.equal(column.name, extra.original.name); assert.equal(column.isDone, extra.original.isDone);
    }
    for (const [index, list] of ordered(source.lists).entries()) {
      const column = board.columns.find((item) => item.id === target("column", list.id));
      assert.ok(column); assert.equal(Boolean(column.archivedAt), list.closed); assert.equal(column.position, index);
      const originalOrder = ordered(source.cards.filter((card) => card.idList === list.id));
      const actualOrder = cards.filter((card) => card.columnId === column.id).sort((a, b) => a.position - b.position);
      assert.deepEqual(actualOrder.map((card) => card.id), originalOrder.map((card) => target("card", card.id)));
    }
    for (const original of source.cards) {
      const card = cardMap.get(target("card", original.id)); assert.ok(card);
      assert.equal(card.title, original.name); assert.equal(card.boardId, board.id); assert.equal(card.columnId, target("column", original.idList));
      assert.equal(card.isTemplate, Boolean(original.isTemplate)); assert.equal(Boolean(card.archivedAt), original.closed);
      assert.equal(Boolean(card.completedAt), original.dueComplete); sameDate(card.dueDate, original.due); sameDate(card.startDate, original.start);
      if (original.dateCompleted && original.dueComplete) sameDate(card.completedAt, original.dateCompleted);
      if (original.dateClosed && original.closed) sameDate(card.archivedAt, original.dateClosed);
      sameDate(card.updatedAt, original.dateLastActivity);
      assert.deepEqual(card.assignees.map((a) => a.userId).sort(), [...new Set((original.idMembers ?? []).map((id) => identityMappings.get(id)).filter(Boolean))].sort());
      const raw = map.get(`card:${original.id}`).original;
      for (const [key, value] of Object.entries(original)) assert.deepEqual(raw[key], provenance(value));
      assert.deepEqual(card.labels.map((label) => label.labelId).sort(), [...new Set((original.idLabels ?? []).map((id) => map.get(`label:${id}`)?.targetId).filter(Boolean))].sort());
      if (original.idAttachmentCover && files.some((file) => file.id === map.get(`attachment:${original.id}:${original.idAttachmentCover}`)?.targetId)) {
        assert.equal(card.coverAttachmentId, target("attachment", `${original.id}:${original.idAttachmentCover}`));
      }
    }
    for (const action of source.actions.filter((item) => item.type === "commentCard")) {
      const comment = commentMap.get(target("comment", action.id)); assert.ok(comment);
      sameDate(comment.createdAt, action.date); assert.equal(comment.userId, identityMappings.get(action.idMemberCreator ?? action.memberCreator?.id) ?? null);
      assert.equal(comment.cardId, target("card", action.data.card.id));
      assert.equal(comment.externalAuthorId, action.idMemberCreator ?? action.memberCreator?.id ?? null);
      assert.deepEqual(map.get(`comment:${action.id}`).original, provenance(action));
      assert.ok(!/<script|javascript:/i.test(comment.body));
    }
    for (const checklist of source.checklists) {
      const actual = await db.checklist.findUniqueOrThrow({ where: { id: target("checklist", checklist.id) }, include: { items: { orderBy: { position: "asc" } } } });
      assert.equal(actual.title, checklist.name); assert.equal(actual.cardId, target("card", checklist.idCard));
      assert.deepEqual(actual.items.map((item) => ({ text: item.text, done: item.done })), ordered(checklist.checkItems).map((item) => ({ text: item.name, done: item.state === "complete" })));
    }
  }
  const compatible = attachmentRows.filter((item) => item.attachmentScope && item.status === "downloaded" && !item.policyReview);
  assert.equal(files.length, compatible.length);
  for (const original of attachmentRows) {
    const record = map.get(`attachment:${original.cardId}:${original.attachmentId}`); assert.ok(record);
    if (!original.attachmentScope) { assert.equal(record.status, "METADATA_ONLY_BY_SCOPE"); assert.equal(record.targetId, null); continue; }
    if (original.policyReview) { assert.ok(["POLICY_REVIEW", "BACKUP_ONLY_UNTIL_REVIEW"].includes(record.status)); assert.equal(record.targetId, null); continue; }
    if (original.status === "external_link") { assert.equal(record.status, "EXTERNAL_LINK"); assert.equal(record.targetId, null); continue; }
    const file = files.find((item) => item.id === record.targetId); assert.ok(file); assert.equal(file.cardId, target("card", original.cardId));
    assert.equal(file.size, original.bytes); const actual = await hashFile(path.join("storage", file.storedName));
    assert.equal(actual.sha256, original.sha256); assert.equal(actual.bytes, original.bytes);
  }
  const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const fingerprint = createHash("sha256").update(canonical({ boards: boards.sort((a, b) => a.id.localeCompare(b.id)), cards: cards.sort((a, b) => a.id.localeCompare(b.id)), comments: comments.sort((a, b) => a.id.localeCompare(b.id)), files: files.sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
  let baseline = null; try { baseline = await read(path.join(output, "audit.json")); } catch { /* first audit */ }
  if (process.argv.includes("--unchanged")) { assert.ok(baseline); assert.equal(fingerprint, baseline.fingerprint); }
  const summary = { verifiedAt: new Date().toISOString(), boards: boards.length, columns: boards.reduce((sum, board) => sum + board.columns.length, 0),
    cards: cards.length, templates: cards.filter((card) => card.isTemplate).length, comments: comments.length, attachments: files.length,
    attachmentBytes: files.reduce((sum, file) => sum + file.size, 0), policyReview: records.filter((item) => item.status === "POLICY_REVIEW").length,
    deferredUntilReview: records.filter((item) => item.status === "BACKUP_ONLY_UNTIL_REVIEW").length,
    acceptedGapCards: records.filter((item) => item.kind === "content-gap" && item.status === "ACCEPTED_ABSENCE").length,
    historicalFilesImported: 0, checklists: await db.checklist.count(), checklistItems: await db.checklistItem.count(), users: await db.user.count(),
    cardsWithAssignees: cards.filter((c) => c.assignees.length).length, assignmentLinks: await db.cardAssignee.count(),
    mappedComments: comments.filter((c) => c.userId).length, externalComments: comments.filter((c) => !c.userId).length,
    fingerprint, unchanged: process.argv.includes("--unchanged") };
  await writeFile(path.join(output, process.argv.includes("--pilot") ? "pilot-audit.json" : "audit.json"), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
