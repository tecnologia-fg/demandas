import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { portalSelect, toPortalPosts, validToken } from "@/server/approvals";
import { SinglePost } from "@/components/approvals/SinglePost";

// Link de um post só (para mandar no WhatsApp): o cliente aprova sem ver os outros posts.
export const dynamic = "force-dynamic";

async function findPost(token: string) {
  if (!validToken(token)) return null;
  return db.approvalPost.findUnique({ where: { token }, select: { ...portalSelect, client: { select: { name: true, color: true, imageUrl: true, active: true } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = await findPost((await params).token);
  return { title: p ? `${p.title} · Aprovação` : "Aprovação", robots: { index: false, follow: false } };
}

export default async function PostApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await findPost(token);
  if (!row || !row.client.active || row.status === "CANCELED") notFound();
  const [post] = toPortalPosts([row]);
  if (!post) notFound();
  return <SinglePost token={token} client={{ name: row.client.name, color: row.client.color, imageUrl: row.client.imageUrl }} post={post} />;
}
