import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { portalSelect, toPortalPosts, validToken } from "@/server/approvals";
import { ApprovalPortal } from "@/components/approvals/ApprovalPortal";

// Link de aprovação do cliente: sem login, todos os posts enviados para este cliente.
export const dynamic = "force-dynamic";

/** Publicados aparecem por 30 dias; o resto fica enquanto não for arquivado. */
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000);
}

async function findClient(token: string) {
  if (!validToken(token)) return null;
  return db.client.findUnique({ where: { approvalToken: token }, select: { id: true, name: true, color: true, imageUrl: true, active: true } });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const c = await findClient((await params).token);
  return { title: c ? `Aprovações · ${c.name}` : "Aprovações", robots: { index: false, follow: false } };
}

export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await findClient(token);
  if (!client || !client.active) notFound();
  const rows = await db.approvalPost.findMany({
    where: { clientId: client.id, OR: [{ status: { in: ["PENDING", "CHANGES", "APPROVED"] } }, { status: "PUBLISHED", updatedAt: { gte: daysAgo(30) } }] },
    orderBy: [{ publishAt: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: portalSelect,
  });
  return <ApprovalPortal token={token} client={{ name: client.name, color: client.color, imageUrl: client.imageUrl }} posts={toPortalPosts(rows)} />;
}
