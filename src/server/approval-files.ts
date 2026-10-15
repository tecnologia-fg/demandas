import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { open, stat } from "fs/promises";
import { storagePath } from "./storage";

/** Serve a arte/vídeo da aprovação, com suporte a Range (o vídeo pula para qualquer ponto no celular). */
export async function serveApprovalFile(req: NextRequest, f: { storedName: string; mime: string }) {
  const path = storagePath(f.storedName);
  const info = await stat(path).catch(() => null);
  if (!info) return NextResponse.json({ error: "Arquivo não está mais no servidor." }, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": f.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = info.size - 1;
  if (range) {
    start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2] || 0));
    end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
  }
  const length = end - start + 1;
  const fh = await open(path, "r");
  const buf = Buffer.alloc(length);
  try {
    await fh.read(buf, 0, length, start);
  } finally {
    await fh.close();
  }
  return new NextResponse(new Uint8Array(buf), {
    status: range ? 206 : 200,
    headers: { ...headers, "Content-Length": String(length), ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}) },
  });
}
