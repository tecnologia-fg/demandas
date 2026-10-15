import "server-only";
import path from "path";

export const STORAGE_DIR = path.join(process.cwd(), "storage");
export const MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB

/** Lista branca: extensão -> tipo servido. Nada de SVG/HTML/executável. */
export const ALLOWED: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv",
  zip: "application/zip",
  mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav",
  psd: "image/vnd.adobe.photoshop", ai: "application/postscript", fig: "application/octet-stream",
};

export function storagePath(storedName: string) {
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(storedName)) throw new Error("nome de arquivo inválido");
  return path.join(STORAGE_DIR, storedName);
}

export function extOf(name: string) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}
