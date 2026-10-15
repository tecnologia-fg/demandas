"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { initials as toInitials } from "@/lib/domain";
import { shapeColors } from "@/lib/color";
import { useFeedback } from "./overlay";

/** Reduz a imagem no navegador para um quadrado de 256 px (corte central), em WebP. */
export async function squareImage(file: File, size = 256): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imagem grande demais (máximo 15 MB).");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Não deu para ler essa imagem.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao preparar a imagem."))), "image/webp", 0.86));
}

export async function uploadProfileImage(target: "pessoa" | "cliente", id: string | null, blob: Blob | null) {
  const form = new FormData();
  form.append("alvo", target);
  if (id) form.append("id", id);
  if (blob) form.append("arquivo", blob, "foto.webp");
  else form.append("remover", "1");
  const res = await fetch("/api/imagens", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Não deu para enviar a imagem.");
  return data.url as string | null;
}

/**
 * Foto de perfil circular com botão de câmera. Com `target` + `id` envia na hora; sem `id` (cadastro novo)
 * devolve a imagem pronta em `onPick` para quem chamou enviar depois de salvar.
 */
export function ImageUpload({
  url,
  name,
  color,
  size = 72,
  target,
  id,
  onChange,
  onPick,
}: {
  url: string | null;
  name: string;
  color: string;
  size?: number;
  target: "pessoa" | "cliente";
  id?: string | null;
  onChange?: (url: string | null) => void;
  onPick?: (blob: Blob | null, preview: string | null) => void;
}) {
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const deferred = Boolean(onPick) && !id;

  const pick = async (file: File) => {
    try {
      setBusy(true);
      const blob = await squareImage(file);
      if (deferred) {
        onPick?.(blob, URL.createObjectURL(blob));
      } else {
        const newUrl = await uploadProfileImage(target, id ?? null, blob);
        onChange?.(newUrl);
        toast("Foto atualizada");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para enviar a imagem.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (deferred) return onPick?.(null, null);
    try {
      setBusy(true);
      await uploadProfileImage(target, id ?? null, null);
      onChange?.(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para remover.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={url ? "Trocar foto" : "Enviar foto"}
        className="group relative shrink-0 overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center font-semibold" style={{ background: shapeColors(color).bg, color: shapeColors(color).fg, fontSize: size * 0.34 }}>
            {toInitials(name || "?")}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
        </span>
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><Loader2 className="size-5 animate-spin" /></span>}
      </button>
      <div className="grid gap-1 text-sm">
        <button type="button" onClick={() => input.current?.click()} className="text-left font-medium text-accent-strong hover:underline">
          {url ? "Trocar foto" : "Enviar foto"}
        </button>
        {url && (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-left text-xs text-fg-3 hover:text-danger">
            <Trash2 className="size-3" /> Remover
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
    </div>
  );
}
