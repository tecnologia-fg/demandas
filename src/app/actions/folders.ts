"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { audit } from "@/server/events";
import { fail, hex, id, run } from "@/server/action";
import { publishBoard } from "@/server/live";

// Pastas de quadros: opcionais, só organizam a tela de Quadros (não mudam permissão nem demandas).

const folderInput = z.object({
  name: z.string().trim().min(1, "Dê um nome à pasta.").max(60),
  color: hex,
});

export async function createFolder(input: { name: string; color: string }) {
  return run(async () => {
    const user = await assertUser();
    const data = folderInput.parse(input);
    const last = await db.boardFolder.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const f = await db.boardFolder.create({ data: { ...data, position: (last?.position ?? 0) + 1 } });
    await audit(user.id, "folder.create", f.name);
    revalidatePath("/", "layout");
    return { id: f.id };
  });
}

export async function updateFolder(folderId: string, input: { name: string; color: string }) {
  return run(async () => {
    await assertUser();
    const data = folderInput.parse(input);
    await db.boardFolder.update({ where: { id: id.parse(folderId) }, data });
    revalidatePath("/", "layout");
  });
}

/** Apaga só a pasta: os quadros dela continuam, soltos na tela de Quadros. */
export async function deleteFolder(folderId: string) {
  return run(async () => {
    const user = await assertUser();
    const f = await db.boardFolder.findUnique({ where: { id: id.parse(folderId) } });
    if (!f) fail("Pasta não encontrada.");
    await db.boardFolder.delete({ where: { id: f.id } });
    await audit(user.id, "folder.delete", f.name);
    revalidatePath("/", "layout");
  });
}

export async function moveBoardToFolder(boardId: string, folderId: string | null) {
  return run(async () => {
    await assertUser();
    const bid = id.parse(boardId);
    const fid = folderId === null ? null : id.parse(folderId);
    if (fid && !(await db.boardFolder.findUnique({ where: { id: fid }, select: { id: true } }))) fail("Pasta não encontrada.");
    await db.board.update({ where: { id: bid }, data: { folderId: fid } });
    revalidatePath("/", "layout");
  });
}

/** Troca rápida da cor do quadro, direto na tela de Quadros. */
export async function setBoardColor(boardId: string, color: string) {
  return run(async () => {
    const user = await assertUser();
    const bid = id.parse(boardId);
    await db.board.update({ where: { id: bid }, data: { color: hex.parse(color) } });
    publishBoard(bid, user.id);
    revalidatePath("/", "layout");
  });
}
