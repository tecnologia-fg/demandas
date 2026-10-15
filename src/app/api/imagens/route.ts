import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/current";
import { rateLimit } from "@/server/rate-limit";
import { IMAGE_DIR, MAX_IMAGE, imagePath, removeImageFile, sniffImage } from "@/server/images";

/**
 * Envia foto de perfil. alvo=pessoa: a própria pessoa; alvo=cliente: qualquer pessoa da equipe.
 * Campo `remover=1` tira a foto.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!rateLimit(`imagem:${user.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Muitos envios seguidos. Espere um pouco." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE + 64 * 1024) return NextResponse.json({ error: "Imagem maior que 5 MB." }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const alvo = form?.get("alvo");
  const id = String(form?.get("id") ?? "").slice(0, 40);
  if (alvo !== "pessoa" && alvo !== "cliente") return NextResponse.json({ error: "Destino inválido." }, { status: 400 });

  // dono da foto
  let current: string | null = null;
  if (alvo === "pessoa") {
    const u = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    current = u?.avatarUrl ?? null;
  } else {
    const c = await db.client.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    current = c.imageUrl;
  }

  let url: string | null = null;
  if (form?.get("remover") !== "1") {
    const file = form?.get("arquivo");
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie uma imagem." }, { status: 400 });
    if (file.size > MAX_IMAGE) return NextResponse.json({ error: "Imagem maior que 5 MB." }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(buf);
    if (!kind) return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
    const name = `${randomBytes(16).toString("hex")}.${kind}`;
    await mkdir(IMAGE_DIR, { recursive: true });
    await writeFile(imagePath(name), buf);
    url = `/api/imagens/${name}`;
  }

  if (alvo === "pessoa") await db.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
  else await db.client.update({ where: { id }, data: { imageUrl: url } });
  await removeImageFile(current);
  return NextResponse.json({ url });
}
