import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { ApprovalsView, type ApprovalRow } from "@/components/approvals/ApprovalsView";

export const metadata: Metadata = { title: "Aprovações" };

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000);
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const user = await requireUser();
  const { post: openPost } = await searchParams;
  const since = daysAgo(30);
  const [posts, clients, boards, approved30] = await Promise.all([
    db.approvalPost.findMany({
      where: { status: { not: "CANCELED" }, client: { active: true } },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: {
        id: true, token: true, title: true, format: true, status: true, publishAt: true, updatedAt: true,
        client: { select: { id: true, name: true, color: true, imageUrl: true } },
        card: { select: { id: true, number: true, boardId: true, board: { select: { name: true } } } },
        rounds: { orderBy: { round: "desc" }, take: 1, select: { round: true, sentAt: true, decidedAt: true, decidedBy: true, clientComment: true, files: { orderBy: { position: "asc" }, select: { id: true, name: true, mime: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { author: true, createdAt: true } },
        _count: { select: { messages: true } },
      },
    }),
    db.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true, imageUrl: true, approvalToken: true } }),
    db.board.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.approval.count({ where: { status: "APPROVED", decidedAt: { gte: since } } }),
  ]);
  const rows: ApprovalRow[] = posts.map((p) => {
    const r = p.rounds[0];
    const files = r?.files ?? [];
    return {
      id: p.id, token: p.token, title: p.title, format: p.format, status: p.status as ApprovalRow["status"], publishAt: p.publishAt?.toISOString() ?? null, updatedAt: p.updatedAt.toISOString(),
      client: p.client, card: p.card ? { id: p.card.id, number: p.card.number, boardId: p.card.boardId, boardName: p.card.board.name } : null,
      round: r?.round ?? 1, sentAt: r?.sentAt.toISOString() ?? p.updatedAt.toISOString(), decidedAt: r?.decidedAt?.toISOString() ?? null, decidedBy: r?.decidedBy ?? null, clientComment: r?.clientComment ?? null,
      thumb: files[0] ? { id: files[0].id, name: files[0].name, video: files[0].mime.startsWith("video/") } : null, mediaCount: files.length,
      messages: p._count.messages, clientWaiting: p.messages[0]?.author === "CLIENT",
    };
  });
  return (
    <ApprovalsView
      rows={rows}
      clients={clients.map((c) => ({ id: c.id, name: c.name, color: c.color, imageUrl: c.imageUrl, hasLink: Boolean(c.approvalToken) }))}
      boards={boards}
      approved30={approved30}
      isAdmin={user.isAdmin}
      openPost={openPost ?? null}
    />
  );
}
