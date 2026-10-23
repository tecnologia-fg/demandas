import Link from "next/link";
import { requireAdminPage } from "@/server/auth/current";
import { db } from "@/server/db";
import { sanitizeRich } from "@/server/richtext";
import { importOrigin } from "@/lib/trello/import-origin";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Histórico importado do Trello" };
const base = "/configuracoes/importar-trello/historico";
export default async function TrelloHistory({ searchParams }: { searchParams: Promise<{ board?: string; card?: string; q?: string; mode?: string; page?: string }> }) {
  await requireAdminPage();
  const params = await searchParams;
  const page = Math.max(0, Math.min(1000, Number(params.page) || 0));
  const boards = await db.board.findMany({ where: { id: { in: (await db.importedEntity.findMany({ where: { kind: "board", targetId: { not: null } }, select: { targetId: true } })).map((item) => item.targetId!) } }, orderBy: { name: "asc" } });
  const boardIds = boards.map((board) => board.id);
  const where: Prisma.CardWhereInput = { boardId: { in: params.board && boardIds.includes(params.board) ? [params.board] : boardIds },
    ...(params.q ? { title: { contains: params.q.slice(0, 100), mode: "insensitive" } } : {}),
    ...(params.mode === "modelos" ? { isTemplate: true } : {}),
    ...(params.mode === "arquivados" ? { OR: [{ archivedAt: { not: null } }, { column: { archivedAt: { not: null } } }, { board: { archivedAt: { not: null } } }] } : {}) };
  const [count, cards, selected] = await Promise.all([
    db.card.count({ where }), db.card.findMany({ where, take: 50, skip: page * 50, orderBy: { number: "asc" }, include: { board: true, column: true } }),
    params.card ? db.card.findFirst({ where: { id: params.card.slice(0, 40), boardId: { in: boardIds } }, include: { board: true, column: true,
      comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } }, attachments: true, checklists: { include: { items: { orderBy: { position: "asc" } } } } } }) : null,
  ]);
  const original = selected ? await db.importedEntity.findFirst({ where: { kind: "card", targetId: selected.id } }) : null;
  const origin = original ? importOrigin(original.original) : null;
  const link = (changes: Record<string, string>) => `${base}?${new URLSearchParams({ ...(params.board ? { board: params.board } : {}), ...(params.mode ? { mode: params.mode } : {}), ...(params.q ? { q: params.q } : {}), ...changes })}`;
  return <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:p-6">
    <div><h1 className="text-2xl font-semibold">Histórico importado do Trello</h1><p className="mt-2 text-sm text-fg-2">Consulte demandas, modelos e arquivos preservados, incluindo quadros e colunas arquivados.</p></div>
    <form className="flex flex-wrap gap-3" action={base}>
      <label className="grid gap-1 text-sm">Quadro<select name="board" defaultValue={params.board ?? ""} className="rounded-xl border border-border bg-surface p-2"><option value="">Todos os {boards.length} quadros</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}{board.archivedAt ? " (arquivado)" : ""}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Exibir<select name="mode" defaultValue={params.mode ?? ""} className="rounded-xl border border-border bg-surface p-2"><option value="">Todos os cards</option><option value="modelos">Modelos</option><option value="arquivados">Arquivados</option></select></label>
      <label className="grid gap-1 text-sm">Título<input name="q" defaultValue={params.q ?? ""} className="rounded-xl border border-border bg-surface p-2" /></label><button className="self-end rounded-full bg-panel px-4 py-2 text-panel-fg">Consultar</button>
    </form>
    {selected && <article className="grid gap-4 rounded-2xl border border-border bg-surface p-5" aria-label="Detalhes importados">
      <h2 className="text-xl font-semibold">{selected.title}</h2><p className="text-sm">{selected.board.name} · {selected.column.name}{selected.isTemplate ? " · Modelo" : ""}{selected.archivedAt || selected.column.archivedAt || selected.board.archivedAt ? " · Arquivado" : ""}</p>
      {origin?.url && <a href={origin.url} target="_blank" rel="noopener noreferrer" className="underline">Abrir card original no Trello</a>}
      {origin && <div className="grid gap-2 text-sm"><p>Lista de origem: {origin.list}</p><p>Responsáveis no Trello: {origin.assignees.map((person) => person.name).join(", ") || "Não informados"}</p>{origin.fields.map((field, index) => <p key={index}>{field.name}: {field.value || "Não preenchido"}</p>)}</div>}
      {selected.description && <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRich(selected.description) }} />}
      {selected.checklists.map((checklist) => <section key={checklist.id}><h3 className="font-semibold">{checklist.title}</h3><ul>{checklist.items.map((item) => <li key={item.id}>{item.done ? "✓" : "○"} {item.text}</li>)}</ul></section>)}
      <section><h3 className="font-semibold">Anexos importados ({selected.attachments.length})</h3><ul>{selected.attachments.map((file) => <li key={file.id}><a href={`/api/anexos/${file.id}?baixar`} className="underline">{file.name}</a></li>)}</ul></section>
      <section className="grid gap-3"><h3 className="font-semibold">Comentários ({selected.comments.length})</h3>{selected.comments.map((comment) => <div key={comment.id} className="border-t border-border pt-3"><p className="text-sm font-medium">{comment.user?.name ?? comment.externalAuthorName ?? "Autor desconhecido"} · {comment.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p><div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRich(comment.body) }} /></div>)}</section>
    </article>}
    <p className="text-sm">{count} cards encontrados · página {page + 1}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Card</th><th className="p-2">Quadro / coluna</th><th className="p-2">Situação</th></tr></thead><tbody>{cards.map((card) => <tr key={card.id} className="border-t border-border"><td className="p-2"><Link className="underline" href={link({ card: card.id, page: String(page) })}>{card.title}</Link></td><td className="p-2">{card.board.name} / {card.column.name}</td><td className="p-2">{card.isTemplate ? "Modelo" : "Demanda"}{card.archivedAt || card.column.archivedAt || card.board.archivedAt ? " · Arquivado" : ""}</td></tr>)}</tbody></table></div>
    <nav className="flex gap-4" aria-label="Páginas de cards">{page > 0 && <Link href={link({ page: String(page - 1) })}>Anterior</Link>}{(page + 1) * 50 < count && <Link href={link({ page: String(page + 1) })}>Próxima</Link>}</nav>
  </div>;
}
