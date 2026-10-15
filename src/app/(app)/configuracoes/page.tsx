import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { SettingsView } from "@/components/settings/SettingsView";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireUser();
  const { aba } = await searchParams;
  const [users, labels, usage, logs] = await Promise.all([
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 500,
      select: { id: true, name: true, email: true, role: true, color: true, avatarUrl: true, active: true, lastLoginAt: true, mustChangePassword: true },
    }),
    db.label.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], take: 200 }),
    db.cardLabel.groupBy({ by: ["labelId"], _count: { _all: true } }),
    user.isAdmin ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 }) : Promise.resolve([]),
  ]);
  const count = new Map(usage.map((u) => [u.labelId, u._count._all]));
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <SettingsView
      initialTab={typeof aba === "string" ? aba : undefined}
      meId={user.id}
      isAdmin={user.isAdmin}
      users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
      labels={labels.map((l) => ({ id: l.id, name: l.name, color: l.color, uses: count.get(l.id) ?? 0 }))}
      logs={logs.map((l) => ({ id: l.id, action: l.action, detail: l.detail, actor: l.actorId ? names.get(l.actorId) ?? "?" : "Sistema", createdAt: l.createdAt.toISOString() }))}
    />
  );
}
