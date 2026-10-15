"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { shortDay } from "@/lib/dates";
import { Modal } from "@/components/ui/overlay";
import { searchCards } from "@/app/actions/search";

type Hit = { id: string; number: number; title: string; boardId: string; boardName: string; boardColor: string; columnName: string; dueDate: string | null; done: boolean; archived: boolean };

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <SearchInner onClose={onClose} /> : null;
}

function SearchInner({ onClose }: { onClose: () => void }) {
  const open = true;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!q.trim()) return;
    let alive = true;
    const t = setTimeout(async () => {
      const res = await searchCards(q);
      if (alive && res.ok) {
        setHits(res.data);
        setIndex(0);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const shown = q.trim() ? hits : [];
  const go = (h: Hit) => {
    onClose();
    router.push(`/quadros/${h.boardId}?demanda=${h.id}`);
  };

  return (
    <Modal open={open} onClose={onClose} bare size="md" label="Buscar demanda">
      <div className="flex items-center gap-3 border-b border-border px-5">
        <Search className="size-5 text-fg-3" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(shown.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && shown[index]) {
              go(shown[index]);
            }
          }}
          placeholder="Buscar por título, texto ou número (#12)"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
        />
      </div>
      <div className="max-h-[60vh] overflow-y-auto scroll-thin p-2">
        {q.trim() && shown.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg-3">Nenhuma demanda encontrada.</p>}
        {!q.trim() && <p className="px-3 py-8 text-center text-sm text-fg-3">Digite para buscar em todos os quadros.</p>}
        {shown.map((h, i) => (
          <button
            key={h.id}
            type="button"
            onMouseEnter={() => setIndex(i)}
            onClick={() => go(h)}
            className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === index && "bg-surface-2")}
          >
            <span className="font-mono text-xs text-fg-3">#{h.number}</span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm font-medium", h.done && "text-fg-2 line-through")}>{h.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-fg-3">
                <span className="size-2 rounded-full" style={{ background: h.boardColor }} />
                {h.boardName} · {h.columnName}
                {h.dueDate && ` · ${shortDay(h.dueDate)}`}
              </span>
            </span>
            {h.archived && <Archive className="size-4 text-fg-3" />}
            {h.done && !h.archived && <CheckCircle2 className="size-4 text-success" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
