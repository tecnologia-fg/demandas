import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current";
import { rateLimit } from "@/server/rate-limit";
import { MAX_UPLOAD, STORAGE_DIR, extOf, storagePath } from "@/server/storage";
import { cleanupStagedFiles } from "@/server/approvals";

// Arte ou vídeo enviado para uma aprovação (antes de mandar ao cliente). Fica guardado sem versão
// até a aprovação ser criada; se não for usado, some depois de 1 dia.
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!rateLimit(`upload-aprovacao:${user.id}`, 60, 60_000).ok) return NextResponse.json({ error: "Muitos envios seguidos. Espere um pouco." }, { status: 429 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD + 1024 * 64) return NextResponse.json({ error: "Arquivo maior que 25 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo." }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "Arquivo maior que 25 MB." }, { status: 413 });
  const ext = extOf(file.name);
  const mime = TYPES[ext];
  if (!mime) return NextResponse.json({ error: "Envie imagem (JPG, PNG, WebP, GIF) ou vídeo (MP4, MOV, WebM)." }, { status: 400 });

  const storedName = `${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(storagePath(storedName), Buffer.from(await file.arrayBuffer()));
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "").slice(0, 160) || `arte.${ext}`;
  const f = await db.approvalFile.create({ data: { name, storedName, mime, size: file.size, uploadedById: user.id } });
  cleanupStagedFiles().catch(() => {});
  return NextResponse.json({ id: f.id, name: f.name, video: mime.startsWith("video/") });
}
