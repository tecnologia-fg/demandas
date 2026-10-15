import "server-only";
import path from "path";
import { unlink } from "fs/promises";
import { STORAGE_DIR } from "./storage";

// Fotos de perfil (pessoas e clientes). Ficam em storage/imagens com nome aleatório e são servidas só para
// quem está logado, por /api/imagens/<nome>. O navegador já manda a imagem reduzida (256 px).

export const IMAGE_DIR = path.join(STORAGE_DIR, "imagens");
export const MAX_IMAGE = 5 * 1024 * 1024;
const NAME_RE = /^[a-f0-9]{32}\.(webp|png|jpg)$/;

export function imagePath(name: string) {
  if (!NAME_RE.test(name)) throw new Error("nome de imagem inválido");
  return path.join(IMAGE_DIR, name);
}

/** Tipo real pelo conteúdo (não confia na extensão nem no tipo enviado pelo navegador). */
export function sniffImage(buf: Buffer): "webp" | "png" | "jpg" | null {
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

export const IMAGE_MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" } as const;

/** Apaga o arquivo antigo quando a foto é trocada ou removida. */
export async function removeImageFile(url: string | null | undefined) {
  const name = url?.split("/").pop();
  if (!name || !NAME_RE.test(name)) return;
  await unlink(imagePath(name)).catch(() => {});
}
