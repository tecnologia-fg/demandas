import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { preparePlan, prepareApprovalFlows, parseTrello } from "./import-plan.ts";
import { executeImport } from "./import-engine.mjs";

const args = process.argv.slice(2);
const value = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
// Capture before Prisma can load a conventional .env implicitly.
const explicitDatabase = process.env.DATABASE_URL, explicitDirect = process.env.DIRECT_URL;
const db = new PrismaClient();
async function run() {
  const switches = new Set(["--apply", "--catalog"]), parameters = new Set(["--plan", "--root", "--output", "--batch", "--bindings", "--label-plan", "--approval-flows", "--decisions", "--storage"]);
  for (let i = 0; i < args.length; i++) {
    if (process.env.TRELLO_REHEARSAL === "1" && /^--fail-board=[a-f0-9]{24}$/.test(args[i])) continue;
    if (switches.has(args[i])) continue;
    assert.ok(parameters.has(args[i]), `Unknown option: ${args[i]}`);
    assert.ok(args[i + 1] && !args[i + 1].startsWith("--"), `Missing value: ${args[i]}`); i++;
  }
  assert.ok(explicitDatabase && explicitDirect === explicitDatabase, "Set DATABASE_URL and identical DIRECT_URL explicitly for the destination");
  const root = path.resolve(value("--root", "research/trello/local/api-capture/2026-10-22"));
  const output = path.resolve(value("--output", "research/trello/local/final-import"));
  const batchId = value("--batch", "trello_20261022_final");
  assert.match(batchId, /^[a-zA-Z0-9_-]{1,80}$/);
  const [boards, clients, users, labels] = await Promise.all([
    db.board.findMany({ where: { archivedAt: null }, select: { id: true, name: true, clientId: true, columns: { where: { archivedAt: null }, select: { id: true, name: true, isDone: true } } } }),
    db.client.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    db.label.findMany({ select: { id: true, name: true, color: true } }),
  ]);
  const options = { boards, clients, users, labels };
  await mkdir(output, { recursive: true });
  if (args.includes("--catalog")) { await writeFile(path.join(output, "destination-catalog.json"), JSON.stringify(options, null, 2)); return { status: "CATALOG_EXPORTED", output }; }
  assert.ok(value("--plan"), "Provide --plan path/to/reviewed.json; without --apply this command only validates");
  const manifest = await read(path.join(root, "reports/import-sources.json"));
  const sources = [];
  for (const item of manifest.boards) {
    const filename = path.resolve(root, item.file); assert.ok(filename.startsWith(root + path.sep));
    sources.push(parseTrello(await readFile(filename, "utf8"), item.file, item.sha256));
  }
  const bindings = value("--bindings") ? await read(value("--bindings")) : {};
  const plan = preparePlan(await read(value("--plan")), sources, options,
    bindings, value("--label-plan") ? await read(value("--label-plan")) : undefined);
  const decisions = await read(value("--decisions", "research/trello/migration-decisions.json"));
  assert.equal(decisions.workspace, manifest.workspace.name);
  assert.equal(decisions.policyFiles.decision, "backup_only_until_review"); assert.equal(decisions.policyFiles.count, 32);
  assert.equal(decisions.missingContent.decision, "accept_and_record");
  const ownedColumns = await db.importedEntity.findMany({ where: { batchId, kind: "approval-column", targetId: { not: null } }, select: { targetId: true } });
  const preparedFlows = value("--approval-flows") ? prepareApprovalFlows(await read(value("--approval-flows")), plan, options, bindings, ownedColumns.map((c) => c.targetId)) : null;
  const effective = { ...plan, contentDecisions: decisions, ...(preparedFlows ? { approvalFlows: preparedFlows.flows, extraApprovalColumns: preparedFlows.extraColumns } : {}) };
  const result = await executeImport({ db, root, output, batchId, reviewed: effective, decisions,
    storage: path.resolve(value("--storage", process.env.STORAGE_DIR?.trim() || "storage")), dryRun: !args.includes("--apply") });
  await writeFile(path.join(output, "effective-plan.json"), JSON.stringify(effective, null, 2));
  await writeFile(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  return result;
}
run().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
