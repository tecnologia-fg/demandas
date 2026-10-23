import Link from "next/link";
import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";
import { approvalFlowKey, approvalFlowSchema } from "@/lib/trello/approval-flow";
import { TrelloApprovalFlows } from "@/components/settings/TrelloApprovalFlows";

export default async function TrelloApprovalFlowsPage() {
  await requireAdminPage();
  const [boards, settings] = await Promise.all([
    db.board.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, columns: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, isDone: true } } } }),
    db.appSetting.findMany({ where: { key: { startsWith: "boardApprovalFlow:" } } }),
  ]);
  return <main className="mx-auto grid max-w-5xl gap-4 p-4 sm:p-6"><Link href="/configuracoes/importar-trello">← Importação Trello</Link>
    <h1 className="text-2xl font-semibold">Destinos de aprovação</h1><p>Escolha as colunas de cada etapa. Renomear ou reordenar uma coluna mantém o destino. Arquivar ou excluir exige nova revisão.</p>
    <TrelloApprovalFlows boards={boards.map((board) => {
      let flow = null; try { const parsed = approvalFlowSchema.safeParse(JSON.parse(settings.find((s) => s.key === approvalFlowKey(board.id))?.value ?? "null")); if (parsed.success) flow = parsed.data; } catch { /* A malformed setting requires review. */ }
      return { ...board, flow };
    })} />
  </main>;
}
