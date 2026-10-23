import "server-only";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { db } from "./db";
import { STORAGE_DIR, storagePath, extOf } from "./storage";

export const TRELLO_TEMPLATE_PREFIX = "trello:";
export const templateSourceInclude = {
  board: true, column: true, labels: true,
  checklists: { orderBy: { position: "asc" as const }, include: { items: { orderBy: { position: "asc" as const } } } },
  attachments: true,
};

/** Each new demand owns its copies. Historical comments, people and dates stay on the source. */
export async function loadTrelloTemplate(templateId: string) {
  if (!templateId.startsWith(TRELLO_TEMPLATE_PREFIX)) return null;
  return db.card.findFirst({ where: { id: templateId.slice(TRELLO_TEMPLATE_PREFIX.length), isTemplate: true, archivedAt: null,
    board: { archivedAt: null }, column: { archivedAt: null } }, include: templateSourceInclude });
}

export async function copyTemplateFiles(files: { id: string; storedName: string; name: string; mime: string; size: number }[], userId: string) {
  const copies: { sourceId: string; storedName: string; name: string; mime: string; size: number; uploadedById: string }[] = [];
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    for (const file of files) {
      const storedName = `${randomBytes(20).toString("hex")}.${extOf(file.storedName) || "bin"}`;
      // Register ownership before copying so a partial copy is cleaned up too.
      copies.push({ sourceId: file.id, storedName, name: file.name, mime: file.mime, size: file.size, uploadedById: userId });
      await copyFile(storagePath(file.storedName), storagePath(storedName));
    }
    return copies;
  } catch (error) {
    await removeTemplateCopies(copies); throw error;
  }
}
export async function removeTemplateCopies(files: { storedName: string }[]) {
  await Promise.all(files.map((file) => unlink(storagePath(file.storedName)).catch(() => {})));
}
