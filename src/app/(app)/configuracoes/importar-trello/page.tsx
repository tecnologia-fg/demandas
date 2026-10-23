import type { Metadata } from "next";
import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";
import { TrelloImportPreview } from "@/components/settings/TrelloImportPreview";
import Link from "next/link";
import { createTrelloClient, createTrelloUser } from "@/app/actions/trello-destinations";

export const metadata: Metadata = { title: "Importar do Trello" };

export default async function TrelloImportPage() {
  await requireAdminPage();
  const [boards, clients, users, labels] = await Promise.all([
    db.board.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, clientId: true, columns: { orderBy: { position: "asc" }, select: { id: true, name: true, isDone: true } } } }),
    db.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.label.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } }),
  ]);
  return <>
    <div className="m-4 flex flex-wrap gap-3">
      <Link href="/configuracoes/importar-trello/etiquetas" className="rounded-full bg-panel px-4 py-2 text-sm text-panel-fg">Revisar e juntar etiquetas</Link>
      <Link href="/configuracoes/importar-trello/pendencias" className="rounded-full bg-panel px-4 py-2 text-sm text-panel-fg">Decisões de conteúdo</Link>
      <Link href="/configuracoes/importar-trello/aprovacoes" className="rounded-full bg-panel px-4 py-2 text-sm text-panel-fg">Destinos de aprovação</Link>
      <Link href="/configuracoes/importar-trello/historico" className="rounded-full bg-panel px-4 py-2 text-sm text-panel-fg">Consultar dados importados do Trello</Link>
    </div>
    <TrelloImportPreview options={{ boards, clients, users, labels }} createDestinations={{ client: createTrelloClient, user: createTrelloUser }} />
  </>;
}
