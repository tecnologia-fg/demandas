import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current";
import { loadBoard } from "@/server/board";
import { getLookups } from "@/server/lookups";
import { db } from "@/server/db";
import { initials } from "@/lib/domain";
import { BoardView } from "@/components/board/BoardView";
import { LookupsProvider } from "@/components/board/lookups";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const b = await db.board.findUnique({ where: { id: id.slice(0, 40) }, select: { name: true } });
  return { title: b?.name ?? "Quadro" };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ demanda?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { demanda } = await searchParams;
  const [board, lookups] = await Promise.all([loadBoard(id.slice(0, 40), user.id), getLookups()]);
  if (!board) notFound();
  return (
    <LookupsProvider me={{ id: user.id, name: user.name, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }} users={lookups.users} labels={lookups.labels} clients={lookups.clients}>
      <BoardView key={board.id} board={board} initialCardId={typeof demanda === "string" ? demanda.slice(0, 40) : null} />
    </LookupsProvider>
  );
}
