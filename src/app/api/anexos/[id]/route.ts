import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current";
import { storagePath } from "@/server/storage";

const INLINE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4", "audio/mpeg"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await ctx.params;
  const a = await db.attachment.findUnique({ where: { id: id.slice(0, 40) } });
  if (!a) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  const data = await readFile(storagePath(a.storedName)).catch(() => null);
  if (!data) return NextResponse.json({ error: "Arquivo não está mais no servidor." }, { status: 404 });
  const download = req.nextUrl.searchParams.has("baixar") || !INLINE.has(a.mime);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
