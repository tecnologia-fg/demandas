import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { initialChoice, exportPlan, parseTrello } from "../../src/lib/trello/preview.ts";
import { targetId } from "./import-engine.mjs";
import { registerImportBatch } from "./import-safety.mjs";

assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
// A new database on each run: never reset the interactive rehearsal or a previous validation.
const databaseName = `dmanda_trello_validation_${Date.now()}`;
const admin = new PrismaClient();
await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
await admin.$disconnect();
url.pathname = `/${databaseName}`;
const env = { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href };
const db = new PrismaClient({ datasourceUrl: url.href });
const output = path.resolve(`research/trello/local/rehearsal/${databaseName}`); await mkdir(output, { recursive: true });
const run = (args, accepted = 0, extra = {}) => {
  const result = spawnSync(args[0], args.slice(1), { env: { ...env, ...extra }, encoding: "utf8", timeout: 300000 });
  if (result.status !== accepted) throw new Error((result.stderr || result.stdout || result.error?.message).slice(-3000));
  return result;
};
try {
  run(["npx", "prisma", "migrate", "deploy"]);
  const concurrent = await Promise.allSettled([
    registerImportBatch(db, { batchId: "registration_race", sourceHash: "registration-fixture", plan: { version: "A" } }),
    registerImportBatch(db, { batchId: "registration_race", sourceHash: "registration-fixture", plan: { version: "B" } }),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1); assert.equal(concurrent.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(registerImportBatch(db, { batchId: "another_registration", sourceHash: "registration-fixture", plan: {} }), /another batch/);
  await db.importBatch.delete({ where: { id: "registration_race" } });
  await db.user.create({ data: { id: "validation_user", email: "existing@example.invalid", name: "Equipe existente", passwordHash: "unchanged-existing-hash", role: "MEMBER", mustChangePassword: true } });
  await db.client.createMany({ data: [{ id: "validation_spmar", name: "SPMAR", notes: "Preservar cadastro" }, { id: "validation_owner", name: "Cliente existente" }] });
  await db.label.create({ data: { id: "validation_label", name: "Criação", color: "#123456", position: 9 } });
  await db.board.create({ data: { id: "validation_board", name: "Quadro já cadastrado", clientId: "validation_owner", columns: { create: [{ id: "validation_inbox", name: "Coluna existente", position: 3 }, { id: "validation_done", name: "Finalizado existente", position: 4, isDone: true }] } } });
  await db.card.create({ data: { id: "validation_manual", boardId: "validation_board", columnId: "validation_inbox", clientId: "validation_owner", number: 1, title: "Demanda preexistente", position: 7, labels: { create: { labelId: "validation_label" } } } });
  const baseline = await db.card.findUnique({ where: { id: "validation_manual" }, include: { labels: true } });
  const userBefore = await db.user.findMany(), clientsBefore = await db.client.findMany(), labelBefore = await db.label.findMany();
  const options = { users: userBefore, clients: clientsBefore, labels: labelBefore, boards: await db.board.findMany({ include: { columns: true } }) };
  const root = path.resolve("research/trello/local/api-capture/2026-10-22"), manifest = JSON.parse(await readFile(path.join(root, "reports/import-sources.json"), "utf8"));
  const raw = [], sources = [];
  for (const entry of manifest.boards) {
    const text = await readFile(path.join(root, entry.file), "utf8"); raw.push(JSON.parse(text)); sources.push(parseTrello(text, entry.file, entry.sha256));
  }
  const choices = sources.map((source) => {
    const choice = initialChoice(source, options);
    if (source.name === "Master Med") {
      choice.targetBoardId = "validation_board"; choice.clientId = "validation_owner";
      let merged = 0;
      for (const list of choice.lists) if (!list.archived && !list.isDone && merged++ < 2) { list.mode = "existing"; list.targetColumnId = "validation_inbox"; }
    } else if (source.name.startsWith("SPMAR")) choice.clientId = "validation_spmar";
    for (const id of Object.keys(choice.people)) choice.people[id] = "validation_user";
    for (const label of source.labels) choice.labels[label.id] = label.name.trim() ? "validation_label" : "__ignore__";
    choice.reviewed = true; return choice;
  });
  const plan = exportPlan(sources, choices, options); assert.equal(plan.status, "reviewed", plan.errors.join("\n"));
  const filename = path.join(output, "reviewed-plan.json"); await writeFile(filename, JSON.stringify(plan, null, 2));
  const command = ["node", "--import", "tsx", "scripts/trello/import.mjs", "--plan", filename, "--output", output, "--batch", "trello_validation", "--approval-flows", "research/trello/local/rehearsal/standard-approval-flows.json"];
  const bad = structuredClone(plan); bad.boards[0].people[Object.keys(bad.boards[0].people)[0]] = "deleted-user";
  const badFile = path.join(output, "invalid-plan.json"); await writeFile(badFile, JSON.stringify(bad));
  run(command.map((item) => item === filename ? badFile : item), 1);
  assert.equal(await db.importBatch.count(), 0); assert.equal(await db.card.count(), 1);
  run(command); assert.equal(await db.importBatch.count(), 0); assert.equal(await db.card.count(), 1);
  const start = Date.now();
  const failed = run([...command, "--apply", `--fail-board=${manifest.boards[0].boardId}`], 1);
  assert.ok(failed.stderr.includes("REHEARSAL_INJECTED_FAILURE"), "Failure must happen inside the board transaction");
  assert.equal(await db.card.count(), 1); assert.equal(await db.importedEntity.count({ where: { kind: "board" } }), 0);
  run([...command, "--apply"]);
  assert.equal(await db.card.count(), 3738); assert.equal(await db.comment.count(), 425); assert.equal(await db.attachment.count(), 1513);
  assert.equal(await db.importedEntity.count({ where: { kind: "attachment", status: "BACKUP_ONLY_UNTIL_REVIEW" } }), 32);
  assert.equal(await db.importedEntity.count({ where: { kind: "content-gap", status: "ACCEPTED_ABSENCE" } }), 4);
  assert.deepEqual(await db.user.findMany(), userBefore); assert.deepEqual(await db.client.findMany(), clientsBefore); assert.deepEqual(await db.label.findMany(), labelBefore);
  assert.deepEqual(await db.card.findUnique({ where: { id: "validation_manual" }, include: { labels: true } }), baseline);
  const cardMap = new Map((await db.card.findMany()).map((c) => [c.id, c]));
  let expectedAssignees = 0;
  for (const board of raw) for (const source of board.cards) {
    const card = cardMap.get(targetId("card", source.id)); assert.ok(card); assert.equal(card.title, source.name); assert.equal(card.isTemplate, !!source.isTemplate);
    if (source.idMembers.length) expectedAssignees++;
    const labels = await db.cardLabel.findMany({ where: { cardId: card.id } });
    const expectedLabels = source.idLabels.some((id) => board.labels.find((l) => l.id === id).name.trim()) ? ["validation_label"] : [];
    assert.deepEqual(labels.map((l) => l.labelId), expectedLabels);
  }
  assert.equal(await db.cardAssignee.count(), expectedAssignees);
  assert.equal(await db.comment.count({ where: { userId: "validation_user" } }), 425);
  assert.equal(await db.board.count({ where: { clientId: "validation_spmar" } }), 2);
  assert.equal(await db.notification.count(), 0); assert.equal(await db.approvalPost.count(), 0);
  assert.equal(await db.appSetting.count({ where: { key: { startsWith: "boardApprovalFlow:" } } }), 16);
  assert.equal(await db.importedEntity.count({ where: { kind: "approval-column" } }), 3);
  const merged = await db.card.findMany({ where: { columnId: "validation_inbox", id: { not: "validation_manual" } } });
  assert.ok(merged.length > 0); assert.ok(merged.every((c) => c.position > 7)); assert.equal(new Set(merged.map((c) => c.position)).size, merged.length);
  const edited = await db.card.findFirst({ where: { id: { startsWith: "tr_" } } }); await db.card.update({ where: { id: edited.id }, data: { title: "Edição posterior preservada" } });
  const counts = { cards: await db.card.count(), entities: await db.importedEntity.count(), batches: await db.importBatch.count() };
  run([...command, "--apply"]);
  assert.deepEqual({ cards: await db.card.count(), entities: await db.importedEntity.count(), batches: await db.importBatch.count() }, counts);
  assert.equal((await db.card.findUnique({ where: { id: edited.id } })).title, "Edição posterior preservada");
  const report = { passedAt: new Date().toISOString(), databaseName, importedCards: 3737, comments: 425, files: 1513, deferredFiles: 32,
    existingUsersPreserved: true, existingClientsPreserved: true, sharedClientTwoBoards: true, existingBoardAndColumns: true, labelMergeAndIgnore: true,
    assignees: expectedAssignees, approvalFlows: 16, additionalApprovalColumns: 3, concurrentPlanConflictRejected: true, invalidPlanNoWrites: true, dryRunNoWrites: true, transactionalFailureResumed: true, repeatNoDuplicates: true, postImportEditPreserved: true, seconds: (Date.now() - start) / 1000 };
  await writeFile(path.join(output, "validation.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
