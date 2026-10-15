"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin } from "@/server/auth/current";
import { audit } from "@/server/events";
import { fail, id, run } from "@/server/action";

// Link público do quadro (só leitura, para o cliente). Só admin cria, troca ou desliga.

export async function getShareLink(boardId: string) {
  return run(async () => {
    await assertAdmin();
    const b = await db.board.findUnique({ where: { id: id.parse(boardId) }, select: { shareToken: true, shareCreatedAt: true } });
    if (!b) fail("Quadro não encontrado.");
    return { token: b.shareToken, createdAt: b.shareCreatedAt?.toISOString() ?? null };
  });
}

/** Cria o link ou troca por um novo (o antigo para de funcionar na hora). */
export async function createShareLink(boardId: string) {
  return run(async () => {
    const user = await assertAdmin();
    const token = randomBytes(24).toString("base64url");
    const b = await db.board.update({ where: { id: id.parse(boardId) }, data: { shareToken: token, shareCreatedAt: new Date() }, select: { name: true } });
    await audit(user.id, "board.share", b.name);
    revalidatePath("/", "layout");
    return { token };
  });
}

export async function revokeShareLink(boardId: string) {
  return run(async () => {
    const user = await assertAdmin();
    const b = await db.board.update({ where: { id: id.parse(boardId) }, data: { shareToken: null, shareCreatedAt: null }, select: { name: true } });
    await audit(user.id, "board.unshare", b.name);
    revalidatePath("/", "layout");
  });
}
