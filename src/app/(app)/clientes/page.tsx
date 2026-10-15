import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { fromDayKey, todayKey } from "@/lib/dates";
import { ClientsView } from "@/components/clients/ClientsView";

function since(days: number) {
  return new Date(Date.now() - days * 86400000);
}

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const user = await requireUser();
  const today = fromDayKey(todayKey())!;
  const [clients, open, late, done, total] = await Promise.all([
    db.client.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], take: 1000 }),
    db.card.groupBy({ by: ["clientId"], where: { clientId: { not: null }, archivedAt: null, completedAt: null }, _count: { _all: true } }),
    db.card.groupBy({ by: ["clientId"], where: { clientId: { not: null }, archivedAt: null, completedAt: null, dueDate: { lt: today } }, _count: { _all: true } }),
    db.card.groupBy({ by: ["clientId"], where: { clientId: { not: null }, completedAt: { gte: since(30) } }, _count: { _all: true } }),
    db.card.groupBy({ by: ["clientId"], where: { clientId: { not: null } }, _count: { _all: true } }),
  ]);
  const m = (rows: { clientId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.clientId!, r._count._all]));
  const [o, l, d, t] = [m(open), m(late), m(done), m(total)];
  return (
    <ClientsView
      isAdmin={user.isAdmin}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        contact: c.contact,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        color: c.color,
        imageUrl: c.imageUrl,
        active: c.active,
        open: o.get(c.id) ?? 0,
        late: l.get(c.id) ?? 0,
        done30: d.get(c.id) ?? 0,
        total: t.get(c.id) ?? 0,
      }))}
    />
  );
}
