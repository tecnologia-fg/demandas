import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current";
import { rateLimit } from "@/server/rate-limit";
import { logActivity } from "@/server/events";
import { publishBoard } from "@/server/live";
import { ALLOWED, MAX_UPLOAD, STORAGE_DIR, extOf, storagePath } from "@/server/storage";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!rateLimit(`upload:${user.id}`, 30, 60_000).ok) return NextResponse.json({ error: "Muitos envios seguidos. Espere um pouco." }, { status: 429 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD + 1024 * 64) return NextResponse.json({ error: "Arquivo maior que 25 MB." }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const cardId = form?.get("cardId");
  if (!(file instanceof File) || typeof cardId !== "string") return NextResponse.json({ error: "Envie um arquivo." }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "Arquivo maior que 25 MB." }, { status: 413 });
  const ext = extOf(file.name);
  const mime = ALLOWED[ext];
  if (!mime) return NextResponse.json({ error: "Tipo de arquivo não aceito." }, { status: 400 });

  const card = await db.card.findUnique({ where: { id: cardId.slice(0, 40) }, select: { id: true, boardId: true, board: { select: { archivedAt: true } } } });
  if (!card || card.board.archivedAt) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

  const storedName = `${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(storagePath(storedName), Buffer.from(await file.arrayBuffer()));
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 160) || `arquivo.${ext}`;
  const a = await db.attachment.create({ data: { cardId: card.id, name, storedName, mime, size: file.size, uploadedById: user.id } });
  await logActivity(db, card.id, user.id, "attachment", { name });
  publishBoard(card.boardId, user.id, card.id);
  return NextResponse.json({ id: a.id, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt.toISOString(), uploadedBy: user.name });
}
