import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { stableHash } from "./import-safety.mjs";
import { labelNameKey, remapCardLabels } from "../../src/lib/trello/label-review.ts";
import { initialChoice, exportPlan, parseTrello } from "../../src/lib/trello/preview.ts";
import { preparePlan, prepareApprovalFlows } from "./import-plan.ts";

// Deliberately restricted to the existing local rehearsal, never production.
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "db");
assert.equal(url.pathname, "/dmanda_trello_rehearsal");
assert.equal(process.env.DATABASE_URL, process.env.DIRECT_URL);
const directory = "research/trello/local/rehearsal";
const plan = JSON.parse(await readFile(`${directory}/client-label-associations.approved.json`, "utf8"));
assert.equal(plan.kind, "dmanda-trello-client-label-review");
assert.equal(plan.status, "approved");
assert.equal(plan.otherClients, "board_name");
const sourceBatch = "trello_20261022_rehearsal";
const batchId = "trello_clients_labels_review_20261023";
const sourceHash = stableHash(plan);
let activePlan = plan;
const colors = { green: "#4bce97", yellow: "#f5cd47", orange: "#fea362", red: "#f87168", purple: "#9f8fef", blue: "#579dff", sky: "#6cc3e0", lime: "#94c748", pink: "#e774bb", black: "#8590a2" };
const json = (value) => JSON.parse(JSON.stringify(value));
const clientName = (name) => activePlan.withoutClient.includes(name) ? null : activePlan.clientGroups.find((g) => g.boards.includes(name))?.name ?? name;
const labelName = (name) => plan.ignoreLabels.includes(labelNameKey(name)) ? null : plan.labelAliases[labelNameKey(name)] ?? name.trim();
const db = new PrismaClient();
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(23102026)`;
    const prior = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (prior) {
      assert.equal(prior.sourceHash, sourceHash); assert.equal(prior.status, "APPLIED");
      return { status: "ALREADY_APPLIED" };
    }
    const source = await tx.importBatch.findUniqueOrThrow({ where: { id: sourceBatch } });
    assert.equal(source.source, "trello"); assert.equal(source.status, "COMPLETED");
    const records = await tx.importedEntity.findMany({ where: { batchId: sourceBatch, kind: { in: ["board", "card", "label"] } } });
    const boardRows = records.filter((r) => r.kind === "board"), cardRows = records.filter((r) => r.kind === "card"), labels = records.filter((r) => r.kind === "label");
    assert.equal(boardRows.length, 33); assert.equal(cardRows.length, 3737); assert.equal(labels.length, 303);
    const names = boardRows.map((r) => r.original.name);
    for (const name of [...plan.withoutClient, ...plan.clientGroups.flatMap((g) => g.boards)]) assert.ok(names.includes(name), `Unknown approved board: ${name}`);
    const beforeBoards = [], beforeCards = [], createdClients = [], createdLabels = [], beforeLabelRecords = [], beforeCardLabels = [], deletedLabels = [];
    const clientsByName = new Map();
    for (const name of new Set(names.map(clientName).filter(Boolean))) {
      const matches = await tx.client.findMany({ where: { name } });
      assert.ok(matches.length <= 1, `Ambiguous client: ${name}`);
      const client = matches[0] ?? await tx.client.create({ data: { name } });
      assert.ok(client.active, `Inactive client: ${name}`);
      if (!matches.length) createdClients.push(client.id);
      clientsByName.set(name, client.id);
    }
    for (const row of boardRows) {
      const board = await tx.board.findUniqueOrThrow({ where: { id: row.targetId } });
      assert.equal(board.name, row.original.name, "Board renamed since review");
      const target = clientsByName.get(clientName(board.name)) ?? null;
      assert.ok(!board.clientId || board.clientId === target, "Preserve a conflicting existing client for review");
      beforeBoards.push({ id: board.id, clientId: board.clientId });
      if (board.clientId !== target) await tx.board.update({ where: { id: board.id }, data: { clientId: target } });
      for (const cardRow of cardRows.filter((r) => r.original.idBoard === row.externalId)) {
        const card = await tx.card.findUniqueOrThrow({ where: { id: cardRow.targetId } });
        assert.equal(card.boardId, board.id);
        assert.ok(!card.clientId || card.clientId === target, "Preserve a conflicting card client for review");
        beforeCards.push({ id: card.id, clientId: card.clientId, updatedAt: card.updatedAt });
        // Keep the Trello activity timestamp when changing the association.
        if (card.clientId !== target) await tx.card.update({ where: { id: card.id }, data: { clientId: target, updatedAt: card.updatedAt } });
      }
    }
    const groups = new Map();
    for (const row of labels) {
      const name = labelName(row.original.name);
      if (name) groups.set(name, [...(groups.get(name) ?? []), row]);
    }
    const destinations = new Map();
    for (const [name, rows] of groups) {
      const counts = new Map();
      for (const row of rows) { const color = row.original.color ?? ""; counts.set(color, (counts.get(color) ?? 0) + 1); }
      const dominant = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const color = plan.labelColors[name] ?? colors[dominant.split("_")[0]] ?? "#64748b";
      const existing = await tx.label.findFirst({ where: { name, color }, orderBy: { id: "asc" } });
      const label = existing ?? await tx.label.create({ data: { name, color } });
      if (!existing) createdLabels.push(label.id);
      destinations.set(name, label);
    }
    const before = new Map(labels.map((r) => [r.externalId, r.targetId]));
    const after = new Map(), changed = new Set(labels.map((r) => r.externalId));
    for (const row of labels) {
      const targetId = destinations.get(labelName(row.original.name))?.id ?? null;
      beforeLabelRecords.push({ id: row.id, targetId: row.targetId, status: row.status });
      after.set(row.externalId, targetId);
      await tx.importedEntity.update({ where: { id: row.id }, data: { targetId, status: targetId ? "MAPPED" : "IGNORED" } });
    }
    for (const row of cardRows) {
      const card = await tx.card.findUniqueOrThrow({ where: { id: row.targetId }, include: { labels: true } });
      const current = card.labels.map((r) => r.labelId).sort();
      const next = remapCardLabels({ id: card.id, sourceLabels: row.original.idLabels ?? [], labels: current }, before, after, changed);
      beforeCardLabels.push({ id: card.id, labels: current });
      if (JSON.stringify(current) === JSON.stringify(next)) continue;
      await tx.cardLabel.deleteMany({ where: { cardId: card.id } });
      if (next.length) await tx.cardLabel.createMany({ data: next.map((labelId) => ({ cardId: card.id, labelId })), skipDuplicates: true });
    }
    const cardTemplates = await tx.cardTemplate.findMany({ select: { labelIds: true } });
    const boardTemplates = await tx.boardTemplate.findMany({ select: { cards: true } });
    for (const id of new Set([...before.values()].filter(Boolean))) {
      if (!id.startsWith("tr_") || cardTemplates.some((t) => t.labelIds.includes(id)) || boardTemplates.some((t) => t.cards.includes(id))) continue;
      if (await tx.cardLabel.count({ where: { labelId: id } }) || await tx.importedEntity.count({ where: { kind: "label", targetId: id } })) continue;
      const label = await tx.label.findUnique({ where: { id } });
      if (label) { deletedLabels.push(label); await tx.label.delete({ where: { id } }); }
    }
    await tx.importBatch.create({ data: { id: batchId, source: "trello-client-label-review", sourceHash, status: "APPLIED", finishedAt: new Date(),
      plan: json({ approved: plan, sourceBatch, beforeBoards, beforeCards, beforeLabelRecords, beforeCardLabels, createdClients, createdLabels, deletedLabels }) } });
    await tx.auditLog.create({ data: { action: "trello.clients-labels.review", detail: batchId } });
    return { status: "APPLIED", createdClients: createdClients.length, createdLabels: createdLabels.length, removedUnusedImportLabels: deletedLabels.length };
  }, { timeout: 180000, maxWait: 120000, isolationLevel: "Serializable" });

  const correction = await db.importBatch.findUnique({ where: { id: "trello_clients_correction_20261023" } });
  if (correction?.status === "APPLIED") activePlan = correction.plan.approved;

  // Verify every imported card, not just aggregate totals; repeat runs verify too.
  const records = await db.importedEntity.findMany({ where: { batchId: sourceBatch } });
  const boards = await db.board.findMany({ include: { client: true } });
  const cards = await db.card.findMany({ include: { labels: { include: { label: true } } } });
  const labelRows = records.filter((r) => r.kind === "label");
  const targets = await db.label.findMany();
  const clients = await db.client.findMany();
  const clientAssociations = [];
  for (const row of records.filter((r) => r.kind === "board")) {
    const board = boards.find((b) => b.id === row.targetId);
    assert.equal(board.client?.name ?? null, clientName(row.original.name));
    clientAssociations.push({ sourceBoardId: row.externalId, sourceBoardName: row.original.name, client: board.client ? { id: board.client.id, name: board.client.name } : null });
    for (const cardRow of records.filter((r) => r.kind === "card" && r.original.idBoard === row.externalId)) {
      const card = cards.find((c) => c.id === cardRow.targetId);
      assert.equal(card.clientId, board.clientId);
      assert.deepEqual(card.labels.map((r) => r.label.name).sort(), [...new Set((cardRow.original.idLabels ?? []).map((id) => labelName(labelRows.find((r) => r.externalId === id).original.name)).filter(Boolean))].sort());
    }
  }
  assert.equal(clients.length, new Set(clientAssociations.map((r) => r.client?.id).filter(Boolean)).size); assert.equal(targets.length, 18);
  assert.equal(clientAssociations.filter((r) => r.client).length, 27);
  assert.equal(labelRows.filter((r) => !r.targetId).length, 13);
  const labelExport = { kind: "dmanda-trello-label-associations", schemaVersion: 1, exportedAt: new Date().toISOString(),
    associations: labelRows.map((r) => ({ sourceLabelId: r.externalId, sourceBoardId: r.original.idBoard, sourceName: r.original.name, sourceColor: r.original.color,
      action: r.targetId ? "associate" : "ignore", target: targets.find((l) => l.id === r.targetId) ?? null })) };
  await writeFile(`${directory}/approved-label-associations.json`, JSON.stringify(labelExport, null, 2));
  await writeFile(`${directory}/approved-client-associations.json`, JSON.stringify({ kind: "dmanda-trello-client-associations", schemaVersion: 1, associations: clientAssociations }, null, 2));
  const root = "research/trello/local/api-capture/2026-10-22";
  const manifest = JSON.parse(await readFile(`${root}/reports/import-sources.json`, "utf8"));
  const sources = await Promise.all(manifest.boards.map(async (b) => parseTrello(await readFile(`${root}/${b.file}`, "utf8"), b.file, b.sha256)));
  const people = JSON.parse(await readFile(`${directory}/approved-people-map.json`, "utf8")).people;
  // New destination boards; client/label IDs refer to local catalog and require
  // explicit destination creation/bindings before use on the VPS.
  const options = { boards: [], clients, labels: targets, users: await db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }) };
  const choices = sources.map((source) => {
    const choice = initialChoice(source, options);
    choice.clientId = clientAssociations.find((a) => a.sourceBoardId === source.id).client?.id ?? "";
    choice.people = Object.fromEntries(Object.keys(choice.people).map((id) => [id, people[id] ?? ""]));
    choice.labels = Object.fromEntries(source.labels.map((label) => [label.id, labelRows.find((r) => r.externalId === label.id).targetId ?? "__ignore__"]));
    choice.reviewed = true;
    return choice;
  });
  const reviewed = preparePlan(exportPlan(sources, choices, options), sources, options, {}, labelExport);
  const flows = JSON.parse(await readFile(`${directory}/standard-approval-flows.json`, "utf8"));
  const preparedFlows = prepareApprovalFlows(flows, reviewed, options);
  assert.equal(Object.keys(preparedFlows.flows).length, 16);
  await writeFile(`${directory}/reviewed-plan.json`, JSON.stringify(reviewed, null, 2));
  await writeFile(`${directory}/approved-destination-catalog.json`, JSON.stringify(options, null, 2));
  const report = { checkedAt: new Date().toISOString(), ...result, clients: clients.length, linkedBoards: 27, boardsWithoutClient: 6, labels: targets.length,
    sourceLabelDefinitions: labelRows.length, ignoredLabelDefinitions: 13, verifiedCards: cards.length, reviewedPlanBoards: reviewed.boards.length,
    validatedApprovalFlows: Object.keys(preparedFlows.flows).length, productionWrites: 0 };
  await writeFile(`${directory}/client-label-associations-result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
