import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { stableHash } from "./import-safety.mjs";

assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
assert.equal(process.env.DATABASE_URL, process.env.DIRECT_URL);
const directory = "research/trello/local/rehearsal";
const correction = JSON.parse(await readFile(`${directory}/client-correction.approved.json`, "utf8"));
assert.equal(correction.kind, "dmanda-trello-client-correction"); assert.equal(correction.status, "approved");
const batchId = "trello_clients_correction_20261023", sourceHash = stableHash(correction);
const db = new PrismaClient();
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
    const prior = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (prior) { assert.equal(prior.sourceHash, sourceHash); assert.equal(prior.status, "APPLIED"); return { status: "ALREADY_APPLIED" }; }
    const previous = await tx.importBatch.findUniqueOrThrow({ where: { id: "trello_clients_labels_review_20261023" } });
    assert.equal(previous.status, "APPLIED");
    const clients = await tx.client.findMany({ where: { name: correction.previousClient } });
    assert.equal(clients.length, 1);
    const old = clients[0]; assert.ok(previous.plan.createdClients.includes(old.id), "Old client was not created by this rehearsal review");
    const group = previous.plan.approved.clientGroups.find((g) => g.name === old.name);
    assert.deepEqual([...group.boards].sort(), [...correction.separateClients].sort());
    const beforeBoards = [], beforeCards = [], createdClients = [];
    for (const name of correction.separateClients) {
      const records = await tx.importedEntity.findMany({ where: { batchId: "trello_20261022_rehearsal", kind: "board" } });
      const record = records.find((r) => r.original.name === name); assert.ok(record);
      const board = await tx.board.findUniqueOrThrow({ where: { id: record.targetId } }); assert.equal(board.clientId, old.id);
      const matches = await tx.client.findMany({ where: { name } }); assert.ok(matches.length <= 1);
      const client = matches[0] ?? await tx.client.create({ data: { name } }); assert.ok(client.active);
      if (!matches.length) createdClients.push(client.id);
      beforeBoards.push({ id: board.id, clientId: board.clientId });
      await tx.board.update({ where: { id: board.id }, data: { clientId: client.id } });
      const cards = await tx.card.findMany({ where: { boardId: board.id } });
      for (const card of cards) {
        assert.equal(card.clientId, old.id);
        beforeCards.push({ id: card.id, clientId: card.clientId, updatedAt: card.updatedAt });
        await tx.card.update({ where: { id: card.id }, data: { clientId: client.id, updatedAt: card.updatedAt } });
      }
    }
    assert.equal(await tx.board.count({ where: { clientId: old.id } }), 0);
    assert.equal(await tx.card.count({ where: { clientId: old.id } }), 0);
    assert.equal(await tx.approvalPost.count({ where: { clientId: old.id } }), 0);
    await tx.client.delete({ where: { id: old.id } });
    const approved = { ...previous.plan.approved, clientGroups: previous.plan.approved.clientGroups.filter((g) => g.name !== old.name) };
    await tx.importBatch.create({ data: { id: batchId, source: "trello-client-correction", sourceHash, status: "APPLIED", finishedAt: new Date(),
      plan: JSON.parse(JSON.stringify({ correction, approved, beforeBoards, beforeCards, createdClients, deletedClient: old })) } });
    await tx.auditLog.create({ data: { action: "trello.clients.correction", detail: batchId } });
    return { status: "APPLIED", boards: beforeBoards.length, cards: beforeCards.length };
  }, { timeout: 120000, isolationLevel: "Serializable" });
  assert.equal(await db.client.count(), 24);
  for (const name of correction.separateClients) {
    const client = await db.client.findFirstOrThrow({ where: { name }, include: { boards: true } });
    assert.equal(client.boards.length, 1); assert.equal(client.boards[0].name, name);
    assert.equal(await db.card.count({ where: { boardId: client.boards[0].id, clientId: { not: client.id } } }), 0);
  }
  const report = { checkedAt: new Date().toISOString(), ...result, clients: 24, productionWrites: 0 };
  await writeFile(`${directory}/client-correction-result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
