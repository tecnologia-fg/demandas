"use client";

import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Film, Images, LayoutGrid, MessageSquareWarning, PenLine, Play, Send, Type, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import { shapeColors } from "@/lib/color";
import { APPROVAL_META } from "@/lib/domain";
import type { ApprovalMedia } from "@/lib/types";

export const STATUS_ICON: Record<string, typeof Check> = { PENDING: Clock3, CHANGES: MessageSquareWarning, APPROVED: Check, PUBLISHED: Send, CANCELED: Clock3 };
export const FORMAT_ICON: Record<string, typeof Check> = { IMAGEM: LayoutGrid, CARROSSEL: Images, REELS: Play, STORIES: Film, VIDEO: Video, TEXTO: Type };

/** Selo da situação, cor sólida com texto em contraste. */
export function StatusChip({ status, size = "sm" }: { status: string; size?: "xs" | "sm" }) {
  const meta = APPROVAL_META[status];
  if (!meta) return null;
  const tone = shapeColors(meta.color);
  const Icon = STATUS_ICON[status] ?? Clock3;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full font-semibold", size === "xs" ? "h-5 px-2 text-[10.5px]" : "h-6 px-2.5 text-xs")} style={{ background: tone.bg, color: tone.fg }}>
      <Icon className="size-3" strokeWidth={status === "APPROVED" ? 3 : 2.25} />
      {meta.short}
    </span>
  );
}

/** Ícone redondo da situação (cabeçalhos das colunas e do resumo). */
export function StatusDot({ status, size = 36 }: { status: string; size?: number }) {
  const meta = APPROVAL_META[status];
  const tone = shapeColors(meta?.color ?? "#84979B");
  const Icon = STATUS_ICON[status] ?? Clock3;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: tone.bg, color: tone.fg }}>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.25} />
    </span>
  );
}

export function ClientMark({ client, size = 40, round }: { client: { name: string; color: string; imageUrl?: string | null }; size?: number; round?: boolean }) {
  const tone = shapeColors(client.color);
  return client.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={client.imageUrl} alt="" width={size} height={size} className={cn("shrink-0 object-cover", round ? "rounded-full" : "rounded-2xl")} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center font-semibold", round ? "rounded-full" : "rounded-2xl")} style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.42) }}>
      {client.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Miniatura de uma arte (imagem ou primeiro quadro do vídeo). */
export function Thumb({ base, media, className, count }: { base: string; media: ApprovalMedia | null; className?: string; count?: number }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-surface-3", className)}>
      {media ? (
        media.video ? (
          <video src={`${base}/${media.id}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${base}/${media.id}`} alt="" loading="lazy" className="size-full object-cover" />
        )
      ) : (
        <span className="flex size-full items-center justify-center text-fg-3"><Type className="size-5" /></span>
      )}
      {media?.video && <span className="absolute bottom-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-black/55 text-white"><Play className="size-2.5 fill-current" /></span>}
      {(count ?? 0) > 1 && <span className="absolute right-1.5 top-1.5 inline-flex h-5 items-center gap-0.5 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white"><Images className="size-2.5" />{count}</span>}
    </span>
  );
}

/** As artes do post em carrossel. Reels e Stories aparecem numa moldura de celular. */
export function MediaView({ base, media, format, className }: { base: string; media: ApprovalMedia[]; format: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const tall = format === "REELS" || format === "STORIES";
  if (media.length === 0) return null;
  const go = (n: number) => ref.current?.scrollTo({ left: n * ref.current.clientWidth, behavior: "smooth" });
  return (
    <div className={cn("relative mx-auto w-full overflow-hidden bg-black", tall ? "max-w-[300px] rounded-[30px] ring-[6px] ring-panel" : "rounded-[24px]", className)}>
      <div ref={ref} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
        {media.map((m, k) => (
          <div key={m.id} className={cn("relative w-full shrink-0 snap-center", tall ? "aspect-[9/16]" : "aspect-[4/5]")}>
            {m.video ? (
              <video src={`${base}/${m.id}`} controls playsInline preload="metadata" className="size-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${base}/${m.id}`} alt={`Arte ${k + 1}`} className="size-full object-cover" />
            )}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <>
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{i + 1}/{media.length}</span>
          {i > 0 && <button type="button" aria-label="Arte anterior" onClick={() => go(i - 1)} className="absolute left-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow"><ChevronLeft className="size-5" /></button>}
          {i < media.length - 1 && <button type="button" aria-label="Próxima arte" onClick={() => go(i + 1)} className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow"><ChevronRight className="size-5" /></button>}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {media.map((m, k) => <span key={m.id} className={cn("size-1.5 rounded-full transition-colors", k === i ? "bg-white" : "bg-white/45")} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** Texto do post (só texto): caixa grande como uma página. */
export function TextOnly({ text }: { text: string }) {
  return (
    <div className="mx-auto grid w-full max-w-md gap-3 rounded-[24px] bg-surface p-6 shadow-sm">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-2 text-fg-2"><PenLine className="size-4" /></span>
      <p className="prose-lite whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
    </div>
  );
}

export function whenLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(/\./g, "");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${day} · ${time}`;
}
