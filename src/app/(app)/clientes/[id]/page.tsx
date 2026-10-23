import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getLookups } from "@/server/lookups";
import { cardSummaryInclude, toCardSummary } from "@/server/serialize";
import { initials } from "@/lib/domain";
import { LookupsProvider } from "@/components/board/lookups";
import { ClientDetail } from "@/components/clients/ClientDetail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await db.client.findUnique({ where: { id: id.slice(0, 40) }, select: { name: true } });
  return { title: c?.name ?? "Cliente" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id: id.slice(0, 40) } });
  if (!client) notFound();
  const [open, done, total, lookups] = await Promise.all([
    db.card.findMany({
      where: { clientId: client.id, archivedAt: null, isTemplate: false, column: { archivedAt: null }, completedAt: null, board: { archivedAt: null } },
      include: { ...cardSummaryInclude, board: { select: { name: true, color: true } }, column: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 500,
    }),
    db.card.findMany({
      where: { clientId: client.id, isTemplate: false, column: { archivedAt: null }, completedAt: { not: null }, board: { archivedAt: null } },
      include: { ...cardSummaryInclude, board: { select: { name: true, color: true } }, column: { select: { name: true } } },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
    db.card.count({ where: { clientId: client.id, isTemplate: false } }),
    getLookups(),
  ]);
  const row = (c: (typeof open)[number]) => ({ ...toCardSummary(c), boardName: c.board.name, boardColor: c.board.color, columnName: c.column.name });
  return (
    <LookupsProvider me={{ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }} users={lookups.users} labels={lookups.labels} clients={lookups.clients}>
      <ClientDetail
        isAdmin={user.isAdmin}
        client={{ id: client.id, name: client.name, contact: client.contact, email: client.email, phone: client.phone, notes: client.notes, color: client.color, imageUrl: client.imageUrl, active: client.active, open: open.length, late: 0, done30: 0, total }}
        open={open.map(row)}
        done={done.map(row)}
      />
    </LookupsProvider>
  );
}
