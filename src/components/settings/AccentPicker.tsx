"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { inkOn } from "@/lib/domain";
import { ACCENT_SUGGESTIONS, DEFAULT_ACCENT, accentCss } from "@/lib/accent";
import { Button } from "@/components/ui/basics";
import { useFeedback } from "@/components/ui/overlay";
import { setAccentColor } from "@/app/actions/team";

/** Cor do sistema: sugestões + "+" para qualquer cor. A prévia aparece na hora; "Salvar" guarda na conta. */
export function AccentPicker({ current }: { current: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const saved = current ?? DEFAULT_ACCENT;
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // prévia ao vivo: troca o <style id="cor-do-sistema"> do layout
  useEffect(() => {
    const el = document.getElementById("cor-do-sistema");
    if (el) el.innerHTML = accentCss(value);
  }, [value]);
  // saiu sem salvar: volta à cor guardada
  useEffect(() => () => {
    const el = document.getElementById("cor-do-sistema");
    if (el) el.innerHTML = accentCss(current);
  }, [current]);

  const isSuggestion = ACCENT_SUGGESTIONS.some((s) => s.hex.toLowerCase() === value.toLowerCase());

  const save = async (v: string | null) => {
    setSaving(true);
    const res = await setAccentColor(v);
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Cor do sistema salva");
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {ACCENT_SUGGESTIONS.map((s) => {
          const on = s.hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={s.hex}
              type="button"
              aria-pressed={on}
              aria-label={s.name}
              title={s.name}
              onClick={() => setValue(s.hex)}
              className={cn("inline-flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-105", on && "ring-2 ring-fg")}
              style={{ background: s.hex, color: inkOn(s.hex) }}
            >
              {on && <Check className="size-4" strokeWidth={3} />}
            </button>
          );
        })}
        <label
          title="Outra cor"
          className={cn("relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105", isSuggestion ? "border-border-strong bg-surface text-fg-2" : "ring-2 ring-fg")}
          style={!isSuggestion ? { background: value, color: inkOn(value), borderColor: value } : undefined}
        >
          {isSuggestion ? <Plus className="size-4" strokeWidth={2.5} /> : <Check className="size-4" strokeWidth={3} />}
          <input ref={inputRef} type="color" value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor do sistema" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink">Botão principal</span>
        <span className="text-sm font-medium text-accent-strong underline underline-offset-4">Link e destaque</span>
        <div className="ml-auto flex gap-2">
          {current && (
            <Button variant="ghost" onClick={() => { setValue(DEFAULT_ACCENT); void save(null); }}>Voltar ao padrão</Button>
          )}
          <Button variant="primary" loading={saving} disabled={value.toLowerCase() === saved.toLowerCase()} onClick={() => save(value.toLowerCase() === DEFAULT_ACCENT.toLowerCase() ? null : value)}>
            Salvar cor
          </Button>
        </div>
      </div>
    </div>
  );
}
