import Link from "next/link";
import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";

export default async function TrelloContentDecisions() {
  await requireAdminPage();
  const rows = await db.importedEntity.findMany({ where: { OR: [{ kind: "attachment", status: { in: ["POLICY_REVIEW", "BACKUP_ONLY_UNTIL_REVIEW"] } }, { kind: "content-gap" }] }, orderBy: { externalId: "asc" } });
  const files = rows.filter((r) => r.kind === "attachment"), gaps = rows.filter((r) => r.kind === "content-gap");
  const data = (value: unknown) => value as { boardName: string; cardTitle: string; name?: string; bytes?: number; missingAttachments?: number; missingComments?: number };
  return <main className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6"><Link href="/configuracoes/importar-trello">← Importação Trello</Link>
    <h1 className="text-2xl font-semibold">Decisões sobre o conteúdo</h1>
    <p>Os arquivos abaixo permanecem somente no backup até revisão. As ausências aceitas continuam registradas como conteúdo não recuperado.</p>
    <h2 className="text-lg font-semibold">Arquivos no backup ({files.length})</h2>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Quadro / card</th><th>Arquivo</th><th>Decisão</th></tr></thead><tbody>{files.map((r) => {
      const item = data(r.original); return <tr key={r.id} className="border-t border-border"><td className="p-2">{item.boardName} / {item.cardTitle}</td><td className="p-2 break-all">{item.name}<br />{((item.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB</td><td className="p-2">{r.status === "BACKUP_ONLY_UNTIL_REVIEW" ? "Manter no backup até revisar" : "Aguardando decisão"}</td></tr>;
    })}</tbody></table></div>
    <h2 className="text-lg font-semibold">Conteúdo não recuperado ({gaps.length} cards)</h2>
    {gaps.map((r) => { const gap = data(r.original); return <article key={r.id} className="rounded-xl border border-border p-3 text-sm"><p className="font-semibold">{gap.boardName} / {gap.cardTitle}</p><p>{gap.missingAttachments ?? 0} referências de anexos · {gap.missingComments ?? 0} comentários</p><p>{r.status === "ACCEPTED_ABSENCE" ? "Ausência aceita e registrada" : "Anexos históricos fora do escopo de binários"}</p></article>; })}
  </main>;
}
