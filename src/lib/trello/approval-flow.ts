import { z } from "zod";

export const approvalFlowSchema = z.object({
  approval: z.string().min(1), next: z.string().min(1), back: z.string().min(1), done: z.string().min(1),
}).strict();
export type ApprovalFlow = z.infer<typeof approvalFlowSchema>;
export const approvalFlowKey = (boardId: string) => `boardApprovalFlow:${boardId}`;
export function resolveApprovalFlow(value: unknown, columns: { id: string; name: string; isDone: boolean }[]) {
  const flow = approvalFlowSchema.parse(value);
  if (new Set(Object.values(flow)).size !== 4) throw new Error("Escolha quatro colunas diferentes para o fluxo de aprovação.");
  const result = Object.fromEntries(Object.entries(flow).map(([key, id]) => {
    const column = columns.find((c) => c.id === id);
    if (!column) throw new Error("Uma coluna configurada foi arquivada, removida ou pertence a outro quadro. Revise o fluxo de aprovação.");
    if (column.isDone !== (key === "done")) throw new Error("Somente o destino Publicado deve ser uma coluna de conclusão.");
    return [key, column];
  })) as Record<keyof ApprovalFlow, typeof columns[number]>;
  return result;
}
