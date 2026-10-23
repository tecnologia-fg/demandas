import assert from "node:assert/strict";
import { z } from "zod";
import { createHash } from "node:crypto";
import { resolveApprovalFlow } from "../../src/lib/trello/approval-flow";
import { boardChoiceSchema, exportPlan, parseTrello, type DestinationOptions, type PreviewSource } from "../../src/lib/trello/preview";

const planSchema = z.object({
  kind: z.literal("dmanda-trello-preview"), schemaVersion: z.literal(1), status: z.literal("reviewed"),
  sources: z.array(z.object({ id: z.string(), sha256: z.string() })), boards: z.array(boardChoiceSchema),
});
const bindingSchema = z.object({
  users: z.record(z.string(), z.string()).default({}), clients: z.record(z.string(), z.string()).default({}),
  boards: z.record(z.string(), z.string()).default({}), columns: z.record(z.string(), z.string()).default({}),
  labels: z.record(z.string(), z.string()).default({}),
}).strict();
export function preparePlan(raw: unknown, sources: PreviewSource[], options: DestinationOptions, bindings: unknown = {}, labelReview?: unknown) {
  const plan = planSchema.parse(raw), maps = bindingSchema.parse(bindings);
  assert.equal(plan.sources.length, sources.length, "Plan must contain the complete capture scope");
  assert.equal(new Set(plan.sources.map((s) => s.id)).size, sources.length, "Duplicate plan sources");
  for (const source of sources) assert.ok(plan.sources.some((s) => s.id === source.id && s.sha256 === source.sha256), `Source hash differs: ${source.id}`);
  for (const source of sources) assert.ok(!source.closed || !plan.boards.find((b) => b.sourceBoardId === source.id)?.targetBoardId, "Archived source board requires a new archived destination");
  const rebind = (kind: keyof typeof maps, value: string) => value ? maps[kind][value] ?? value : value;
  const boards = plan.boards.map((b) => ({ ...b,
    targetBoardId: rebind("boards", b.targetBoardId), clientId: rebind("clients", b.clientId),
    lists: b.lists.map((l) => ({ ...l, targetColumnId: rebind("columns", l.targetColumnId) })),
    people: Object.fromEntries(Object.entries(b.people).map(([id, value]) => [id, rebind("users", value)])),
    labels: Object.fromEntries(Object.entries(b.labels).map(([id, value]) => [id, value === "__ignore__" ? value : rebind("labels", value)])),
  }));
  if (labelReview) {
    const review = z.object({ kind: z.literal("dmanda-trello-label-associations"), schemaVersion: z.literal(1), associations: z.array(z.object({
      sourceBoardId: z.string(), sourceLabelId: z.string(), sourceName: z.string(), sourceColor: z.string().nullable(),
      action: z.enum(["associate", "ignore"]), target: z.object({ id: z.string() }).nullable(),
    })) }).parse(labelReview);
    const seen = new Set<string>();
    for (const item of review.associations) {
      const source = sources.find((s) => s.id === item.sourceBoardId), label = source?.labels.find((l) => l.id === item.sourceLabelId);
      assert.ok(label && label.name === item.sourceName && label.color === item.sourceColor, "Label review differs from source");
      assert.ok(!seen.has(item.sourceLabelId), "Duplicate label association"); seen.add(item.sourceLabelId);
      assert.ok(item.action === "ignore" || item.target, "Missing label destination");
      boards.find((b) => b.sourceBoardId === item.sourceBoardId)!.labels[item.sourceLabelId] = item.action === "ignore" ? "__ignore__" : rebind("labels", item.target!.id);
    }
    assert.equal(seen.size, sources.reduce((n, s) => n + s.labels.length, 0), "Global label review must cover all source labels");
  }
  const validated = exportPlan(sources, boards, options);
  assert.equal(validated.status, "reviewed", validated.errors.join("\n") || "Every board must be reviewed");
  return validated;
}
export { parseTrello };

export function prepareApprovalFlows(raw: unknown, plan: ReturnType<typeof preparePlan>, options: DestinationOptions, bindings: unknown = {}, ownedColumnIds: readonly string[] = []) {
  const extraColumn = z.object({ key: z.string().min(1).max(60), name: z.string().trim().min(1).max(80), isDone: z.boolean() }).strict();
  const reference = z.union([z.object({ sourceListId: z.string() }).strict(), z.object({ targetColumnId: z.string() }).strict(), z.object({ newColumn: extraColumn }).strict()]);
  const parsed = z.object({ kind: z.literal("dmanda-trello-approval-flows"), schemaVersion: z.literal(1), flows: z.array(z.object({
    sourceBoardId: z.string(), approval: reference, next: reference, back: reference, done: reference,
  })) }).parse(raw);
  const maps = bindingSchema.parse(bindings), result: Record<string, { approval: string; next: string; back: string; done: string }> = {};
  const extraColumns: Record<string, (z.infer<typeof extraColumn> & { id: string })[]> = {};
  const existingFlows = new Map<string, string>();
  for (const item of parsed.flows) {
    assert.ok(!result[item.sourceBoardId], "Repeated approval board");
    const board = plan.boards.find((b) => b.sourceBoardId === item.sourceBoardId); assert.ok(board, "Approval board absent from plan");
    const columnId = (sourceListId: string) => {
      const list = board.lists.find((l) => l.sourceListId === sourceListId); assert.ok(list && list.mode !== "omit" && !list.archived, "Approval list unavailable");
      return list.mode === "existing" ? list.targetColumnId : "tr_" + createHash("sha256").update(`column:${sourceListId}`).digest("hex").slice(0, 32);
    };
    const columns = [...(options.boards.find((b) => b.id === board.targetBoardId)?.columns ?? []),
      ...board.lists.filter((l) => l.mode === "new" && !l.archived).map((l) => ({ id: columnId(l.sourceListId), name: l.name, isDone: l.isDone }))];
    const resolve = (ref: z.infer<typeof reference>) => {
      if ("sourceListId" in ref) return columnId(ref.sourceListId);
      if ("targetColumnId" in ref) return maps.columns[ref.targetColumnId] ?? ref.targetColumnId;
      const id = "tr_" + createHash("sha256").update(`approval-column:${item.sourceBoardId}:${ref.newColumn.key}`).digest("hex").slice(0, 32);
      assert.ok(ownedColumnIds.includes(id) || !options.boards.some((b) => b.columns.some((c) => c.id === id)), "Additional approval column already exists; associate it explicitly");
      const extra = { ...ref.newColumn, id };
      (extraColumns[item.sourceBoardId] ??= []).push(extra); columns.push(extra); return id;
    };
    const flow = { approval: resolve(item.approval), next: resolve(item.next), back: resolve(item.back), done: resolve(item.done) };
    resolveApprovalFlow(flow, columns);
    if (board.targetBoardId) {
      const fingerprint = JSON.stringify(flow), previous = existingFlows.get(board.targetBoardId);
      assert.ok(!previous || previous === fingerprint, "Conflicting approval flows for the same destination board");
      existingFlows.set(board.targetBoardId, fingerprint);
    }
    result[item.sourceBoardId] = flow;
  }
  return { flows: result, extraColumns };
}
