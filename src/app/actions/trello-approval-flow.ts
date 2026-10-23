"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin } from "@/server/auth/current";
import { fail, id, run } from "@/server/action";
import { approvalFlowKey, approvalFlowSchema, resolveApprovalFlow } from "@/lib/trello/approval-flow";

export async function saveTrelloApprovalFlow(boardId: string, input: unknown) {
  return run(async () => {
    const actor = await assertAdmin(), board = id.parse(boardId), flow = approvalFlowSchema.parse(input);
    await db.$transaction(async (tx) => {
      const found = await tx.board.findFirst({ where: { id: board, archivedAt: null }, include: { columns: { where: { archivedAt: null } } } });
      if (!found) fail("Quadro indisponível.");
      try { resolveApprovalFlow(flow, found.columns); } catch (error) { fail((error as Error).message); }
      const key = approvalFlowKey(board);
      await tx.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(flow) }, update: { value: JSON.stringify(flow) } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "trello.approval-flow", detail: JSON.stringify({ boardId: board, ...flow }) } });
    });
    revalidatePath("/configuracoes/importar-trello/aprovacoes");
  });
}

export async function exportTrelloApprovalFlows() {
  return run(async () => {
    await assertAdmin();
    const [records, origins, settings] = await Promise.all([
      db.importedEntity.findMany({ where: { kind: "board", batch: { source: "trello" } }, select: { kind: true, externalId: true, targetId: true } }),
      db.importedEntity.findMany({ where: { OR: [{ kind: "column", batch: { source: "trello" } }, { kind: "approval-column" }] }, select: { kind: true, externalId: true, targetId: true, original: true } }),
      db.appSetting.findMany({ where: { key: { startsWith: "boardApprovalFlow:" } } }),
    ]);
    const flows = [];
    for (const board of records.filter((r) => r.kind === "board" && r.targetId)) {
      const setting = settings.find((s) => s.key === approvalFlowKey(board.targetId!)); if (!setting) continue;
      const flow = approvalFlowSchema.parse(JSON.parse(setting.value));
      const columns = await db.column.findMany({ where: { boardId: board.targetId!, archivedAt: null } });
      try { resolveApprovalFlow(flow, columns); } catch (error) { fail((error as Error).message); }
      flows.push({ sourceBoardId: board.externalId, ...Object.fromEntries(Object.entries(flow).map(([key, columnId]) => {
        const source = origins.find((r) => r.kind === "column" && r.targetId === columnId && (r.original as { idBoard?: string }).idBoard === board.externalId);
        const extra = origins.find((r) => r.kind === "approval-column" && r.targetId === columnId && (r.original as { sourceBoardId?: string }).sourceBoardId === board.externalId)?.original as { key: string } | undefined;
        const column = columns.find((c) => c.id === columnId)!;
        return [key, source ? { sourceListId: source.externalId } : extra ? { newColumn: { key: extra.key, name: column.name, isDone: column.isDone } } : { targetColumnId: columnId }];
      })) });
    }
    return { kind: "dmanda-trello-approval-flows", schemaVersion: 1, flows };
  });
}
