import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { stableHash } from "./import-safety.mjs";
import { preparePlan, prepareApprovalFlows, parseTrello } from "./import-plan.ts";

// Explicit environment and --apply are required; no accounts are created/updated.
const database = process.env.DATABASE_URL;
assert.ok(database && database === process.env.DIRECT_URL, "Load explicit, identical destination database URLs");
const args = process.argv.slice(2);
assert.ok(args.every((a) => a === "--apply"), "Only --apply is supported");
const apply = args.includes("--apply");
const directory = "research/trello/local/rehearsal", output = "research/trello/local/vps/destinations";
const read = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const [local, reviewed, labels, people, flows] = await Promise.all([
  read(`${directory}/approved-destination-catalog.json`), read(`${directory}/reviewed-plan.json`),
  read(`${directory}/approved-label-associations.json`), read(`${directory}/user-associations.approved.json`), read(`${directory}/standard-approval-flows.json`),
]);
assert.equal(reviewed.status, "reviewed"); assert.equal(reviewed.boards.length, 33);
assert.equal(people.status, "approved"); assert.equal(people.associations.length, 12);
const desired = {
  clients: local.clients.map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id)),
  labels: local.labels.map(({ id, name, color }) => ({ id, name, color })).sort((a, b) => a.id.localeCompare(b.id)),
  users: people.associations.map(({ targetUserId, targetEmail }) => ({ id: targetUserId, email: targetEmail })).sort((a, b) => a.id.localeCompare(b.id)),
};
assert.equal(desired.clients.length, 24); assert.equal(desired.labels.length, 18);
assert.equal(new Set(desired.clients.map((c) => c.name)).size, 24);
assert.equal(new Set(desired.labels.map((l) => l.name)).size, 18);
for (const choice of reviewed.boards) {
  assert.ok(!choice.targetBoardId, "This cutover creates separate boards");
  assert.ok(!choice.clientId || desired.clients.some((c) => c.id === choice.clientId));
  for (const user of Object.values(choice.people).filter(Boolean)) assert.ok(desired.users.some((u) => u.id === user));
}
const sourceHash = stableHash(desired), batchId = "trello_destinations_20261023", db = new PrismaClient();
try {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
    const prior = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (prior) { assert.equal(prior.sourceHash, sourceHash); assert.equal(prior.status, "APPLIED"); }
    for (const person of desired.users) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: person.id }, select: { email: true, active: true } });
      assert.equal(user.email, person.email); assert.ok(user.active, "Approved account is inactive");
    }
    const bindings = { users: {}, clients: {}, labels: {}, boards: {}, columns: {} }, createdClients = [], createdLabels = [];
    let clientsToCreate = 0, labelsToCreate = 0;
    for (const item of desired.clients) {
      const matches = await tx.client.findMany({ where: { name: item.name } });
      assert.ok(matches.length <= 1, `Ambiguous client name: ${item.name}`);
      if (matches.length) assert.ok(matches[0].active, `Inactive client: ${item.name}`);
      else clientsToCreate++;
      const target = matches[0] ?? (apply ? await tx.client.create({ data: { name: item.name } }) : null);
      if (target) { bindings.clients[item.id] = target.id; if (!matches.length) createdClients.push(target.id); }
    }
    for (const item of desired.labels) {
      const matches = await tx.label.findMany({ where: { name: item.name } });
      assert.ok(matches.length <= 1, `Ambiguous label name: ${item.name}`);
      if (matches.length) assert.equal(matches[0].color, item.color, `Review existing label color: ${item.name}`);
      else labelsToCreate++;
      const target = matches[0] ?? (apply ? await tx.label.create({ data: { name: item.name, color: item.color } }) : null);
      if (target) { bindings.labels[item.id] = target.id; if (!matches.length) createdLabels.push(target.id); }
    }
    if (prior) assert.equal(stableHash(prior.plan.bindings), stableHash(bindings), "Destination changed since setup");
    if (apply && !prior) {
      await tx.importBatch.create({ data: { id: batchId, source: "trello-destination-setup", sourceHash, status: "APPLIED", finishedAt: new Date(),
        plan: { desired, bindings, createdClients, createdLabels } } });
      await tx.auditLog.create({ data: { action: "trello.destinations.prepare", detail: batchId } });
    }
    return { status: prior ? "ALREADY_APPLIED" : apply ? "APPLIED" : "PREFLIGHT_PASSED", clientsToCreate, labelsToCreate, bindings };
  }, { timeout: 120000, isolationLevel: "Serializable" });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "setup-result.json"), JSON.stringify({ ...result, bindings: undefined, checkedAt: new Date().toISOString() }, null, 2));
  if (apply || result.status === "ALREADY_APPLIED") {
    const [clients, targetLabels, users, boards] = await Promise.all([
      db.client.findMany({ where: { active: true }, select: { id: true, name: true } }), db.label.findMany({ select: { id: true, name: true, color: true } }),
      db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
      db.board.findMany({ where: { archivedAt: null }, select: { id: true, name: true, clientId: true, columns: { where: { archivedAt: null }, select: { id: true, name: true, isDone: true } } } }),
    ]);
    const root = "research/trello/local/api-capture/2026-10-22", manifest = await read(`${root}/reports/import-sources.json`);
    const sources = await Promise.all(manifest.boards.map(async (b) => parseTrello(await readFile(`${root}/${b.file}`, "utf8"), b.file, b.sha256)));
    const options = { boards, clients, labels: targetLabels, users };
    const effective = preparePlan(reviewed, sources, options, result.bindings, labels);
    const preparedFlows = prepareApprovalFlows(flows, effective, options, result.bindings);
    assert.equal(Object.keys(preparedFlows.flows).length, 16);
    await writeFile(path.join(output, "bindings.json"), JSON.stringify(result.bindings, null, 2));
    await writeFile(path.join(output, "destination-catalog.json"), JSON.stringify(options, null, 2));
    await writeFile(path.join(output, "reviewed-plan.production.json"), JSON.stringify(effective, null, 2));
  }
  console.log(JSON.stringify({ ...result, bindings: undefined, usersChanged: 0, boardsChanged: 0 }));
} catch (error) {
  // Prisma diagnostics may include connection details; keep failures concise.
  if (error.name === "AssertionError") console.error(error.message);
  else console.error(JSON.stringify({ status: "DESTINATION_SETUP_FAILED", code: error.code ?? error.name }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
