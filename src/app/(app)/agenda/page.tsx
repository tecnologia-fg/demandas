import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getLookups } from "@/server/lookups";
import { cardSummaryInclude, toCardSummary } from "@/server/serialize";
import { initials } from "@/lib/domain";
import { LookupsProvider } from "@/components/board/lookups";
import { AgendaView } from "@/components/home/AgendaView";

function monthsFromNow(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const user = await requireUser();
  const [cards, boards, lookups] = await Promise.all([
    // com prazo: de 6 meses atrás a 1 ano à frente; sem prazo: só as abertas (lista lateral)
    db.card.findMany({
      where: { archivedAt: null, isTemplate: false, column: { archivedAt: null }, board: { archivedAt: null }, OR: [{ dueDate: { gte: monthsFromNow(-6), lte: monthsFromNow(12) } }, { dueDate: null, completedAt: null }] },
      include: cardSummaryInclude,
      orderBy: [{ dueDate: "asc" }],
      take: 3000,
    }),
    db.board.findMany({ where: { archivedAt: null }, select: { id: true, name: true, color: true }, orderBy: { position: "asc" }, take: 300 }),
    getLookups(),
  ]);
  return (
    <LookupsProvider me={{ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }} users={lookups.users} labels={lookups.labels} clients={lookups.clients}>
      <AgendaView cards={cards.map(toCardSummary)} boards={boards} meId={user.id} />
    </LookupsProvider>
  );
}
