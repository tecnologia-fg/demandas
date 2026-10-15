import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getCurrentUser } from "@/server/auth/current";
import { IMAGE_MIME, imagePath } from "@/server/images";

export async function GET(_: Request, ctx: { params: Promise<{ nome: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { nome } = await ctx.params;
  let file: string;
  try {
    file = imagePath(nome);
  } catch {
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  }
  const data = await readFile(file).catch(() => null);
  if (!data) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  const ext = nome.split(".").pop() as keyof typeof IMAGE_MIME;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": IMAGE_MIME[ext],
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
