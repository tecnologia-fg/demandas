"use client";

import { useRef, useState } from "react";
import { setGlassLevel } from "@/app/actions/team";

/** Lê o nível atual aplicado no <html> (0 a 100). */
export function currentGlass() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gl"));
  return Number.isFinite(v) ? Math.round(v * 100) : 100;
}

/**
 * Barrinha do vidro: arrasta de "liso" a "vidro máximo". A tela muda enquanto arrasta;
 * grava na conta ao soltar (e alguns instantes depois de parar).
 */
export function GlassSlider({ initial, compact }: { initial?: number; compact?: boolean }) {
  // sem valor inicial (menu de tema): lê o que está aplicado na tela
  const [value, setValue] = useState(() => initial ?? (typeof document === "undefined" ? 100 : currentGlass()));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (v: number) => {
    setValue(v);
    document.documentElement.style.setProperty("--gl", String(v / 100));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void setGlassLevel(v), 500);
  };

  return (
    <div className={compact ? "grid gap-1.5 px-2.5 py-1.5" : "grid gap-2"}>
      <div className="flex items-center justify-between text-xs font-medium text-fg-2">
        <span>Liso</span>
        <span className="tabular-nums text-fg-3">{value}%</span>
        <span>Vidro</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label="Intensidade do vidro"
        onChange={(e) => apply(Number(e.target.value))}
        className="glass-range w-full"
        style={{ "--pct": `${value}%` } as React.CSSProperties}
      />
    </div>
  );
}
