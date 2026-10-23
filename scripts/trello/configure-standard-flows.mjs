import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { approvalFlowKey, resolveApprovalFlow } from "../../src/lib/trello/approval-flow.ts";
import { targetId } from "./import-engine.mjs";
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const db = new PrismaClient(), apply = process.argv.includes("--apply");
const normalize = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const stages = { approval: "em aprovacao", next: "aprovado / agendar", back: "ajustes", done: "concluido" };
try {
  const records = await db.importedEntity.findMany({ where: { batchId: "trello_20261022_rehearsal", kind: { in: ["board", "column"] } } });
  const report = { configured: [], unavailable: [] }, flows = [];
  for (const source of records.filter((r) => r.kind === "board")) {
    const board = await db.board.findFirst({ where: { id: source.targetId, archivedAt: null }, include: { columns: { where: { archivedAt: null } } } }); if (!board) continue;
    const sourceColumns = records.filter((r) => r.kind === "column" && source.original.lists.some((l) => l.id === r.externalId));
    const references = {};
    for (const [key, name] of Object.entries(stages)) {
      const matches = sourceColumns.filter((r) => normalize(r.original.name) === name && board.columns.some((c) => c.id === r.targetId));
      if (matches.length === 1) references[key] = matches[0];
    }
    if (Object.keys(references).length !== 4 && board.name === "Liquitudo" && process.argv.includes("--liquitudo") && references.approval) {
      const definitions = [{ key: "back", name: "Ajustes", isDone: false }, { key: "next", name: "Aprovado / Agendar", isDone: false }, { key: "done", name: "Publicado", isDone: true }];
      const flow = { approval: references.approval.targetId, ...Object.fromEntries(definitions.map((d) => [d.key, targetId("approval-column", `${source.externalId}:${d.key}`)])) };
      const batchId = "trello_liquitudo_flow_20261023", decision = { board: "Liquitudo", sourceBoardId: source.externalId, userAnswer: "Criar Ajustes, Aprovado / Agendar e Publicado", definitions };
      if (apply) await db.$transaction(async (tx) => {
        const existingFlow = await tx.appSetting.findUnique({ where: { key: approvalFlowKey(board.id) } });
        assert.ok(!existingFlow || existingFlow.value === JSON.stringify(flow), "Preserve existing explicit Liquitudo flow");
        await tx.importBatch.upsert({ where: { id: batchId }, create: { id: batchId, source: "trello-approval-flow-review", sourceHash: createHash("sha256").update(JSON.stringify(decision)).digest("hex"), plan: decision, status: "APPLIED", finishedAt: new Date() }, update: {} });
        const last = await tx.column.aggregate({ where: { boardId: board.id }, _max: { position: true } }); let position = (last._max.position ?? -1) + 1;
        for (const d of definitions) {
          const id = flow[d.key];
          const record = await tx.importedEntity.findUnique({ where: { batchId_kind_externalId: { batchId, kind: "approval-column", externalId: `${source.externalId}:${d.key}` } } });
          if (record) { assert.equal(record.targetId, id); continue; }
          assert.ok(!await tx.column.findUnique({ where: { id } }), "Column ID already exists without migration provenance");
          await tx.column.create({ data: { id, boardId: board.id, name: d.name, isDone: d.isDone, position: position++ } });
          await tx.importedEntity.create({ data: { batchId, kind: "approval-column", externalId: `${source.externalId}:${d.key}`, targetId: id, status: "CREATED_BY_FLOW_REVIEW", original: { ...d, sourceBoardId: source.externalId } } });
        }
        resolveApprovalFlow(flow, await tx.column.findMany({ where: { boardId: board.id, archivedAt: null } }));
        const key = approvalFlowKey(board.id), value = JSON.stringify(flow);
        await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
      });
      report.configured.push({ boardId: board.id, name: board.name, flow, source: "explicit_user_decision_20261023" });
      flows.push({ sourceBoardId: source.externalId, approval: { sourceListId: references.approval.externalId }, ...Object.fromEntries(definitions.map((d) => [d.key, { newColumn: d }])) });
      continue;
    }
    if (Object.keys(references).length !== 4) { report.unavailable.push({ boardId: board.id, sourceBoardId: source.externalId, name: board.name, reason: "No complete unambiguous source approval stages; portal remains blocked pending explicit configuration" }); continue; }
    const flow = Object.fromEntries(Object.entries(references).map(([key, r]) => [key, r.targetId])); resolveApprovalFlow(flow, board.columns);
    const key = approvalFlowKey(board.id), value = JSON.stringify(flow);
    const previous = await db.appSetting.findUnique({ where: { key } });
    if (previous && previous.value !== value) { report.unavailable.push({ boardId: board.id, name: board.name, reason: "Existing explicit configuration preserved" }); continue; }
    if (apply) await db.$transaction(async (tx) => {
      await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
      if (!previous) await tx.auditLog.create({ data: { action: "trello.approval-flow.source-stages", detail: JSON.stringify({ boardId: board.id, ...flow }) } });
    });
    report.configured.push({ boardId: board.id, name: board.name, flow, source: "exact_source_stage_names" });
    flows.push({ sourceBoardId: source.externalId, ...Object.fromEntries(Object.entries(references).map(([key, r]) => [key, { sourceListId: r.externalId }])) });
  }
  if (apply) {
    await writeFile("research/trello/local/rehearsal/standard-approval-flows.json", JSON.stringify({ kind: "dmanda-trello-approval-flows", schemaVersion: 1, flows }, null, 2));
    await writeFile("research/trello/local/rehearsal/approval-flow-review.json", JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ apply, configured: report.configured.length, unavailable: report.unavailable.map((b) => b.name) }));
} finally { await db.$disconnect(); }
