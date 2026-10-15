"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { shapeColors } from "@/lib/color";
import type { UserLite } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  dark: "bg-panel text-panel-fg hover:bg-panel-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }>(
  function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
          size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
          VARIANTS[variant],
          className,
        )}
        {...rest}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }>(
  function IconButton({ label, active, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
          active ? "bg-panel text-panel-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-fg placeholder:text-fg-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--focus)]",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-[var(--focus)] resize-y",
        className,
      )}
      {...rest}
    />
  );
});

/**
 * Campo com rótulo. Para uma caixa de texto, usa <label> (clicar no rótulo foca o campo). Para grupos de botões,
 * seletores e editores, use `group`: vira role="group" com nome, sem colar o texto do rótulo no primeiro botão.
 */
export function Field({ label, hint, children, group }: { label: string; hint?: string; children: React.ReactNode; group?: boolean }) {
  const id = useId();
  if (group) {
    return (
      <div role="group" aria-labelledby={`${id}-r`} className="grid gap-1.5">
        <span id={`${id}-r`} className="text-[13px] font-medium text-fg-2">{label}</span>
        {children}
        {hint && <span className="text-xs text-fg-3">{hint}</span>}
      </div>
    );
  }
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function Avatar({ user, size = 28, ring }: { user: Pick<UserLite, "name" | "color" | "initials"> & { avatarUrl?: string | null }; size?: number; ring?: boolean }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        width={size}
        height={size}
        className={cn("inline-block shrink-0 rounded-full object-cover", ring && "ring-2 ring-surface")}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={user.name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", ring && "ring-2 ring-surface")}
      style={{ width: size, height: size, background: shapeColors(user.color).bg, color: shapeColors(user.color).fg, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {user.initials}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 24 }: { users: UserLite[]; max?: number; size?: number }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center justify-center rounded-full bg-panel text-panel-fg ring-2 ring-surface font-semibold" style={{ width: size, height: size, fontSize: 10 }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/** Etiqueta sólida: fundo cheio da cor, texto em contraste. */
export function LabelChip({ name, color, size = "sm" }: { name: string; color: string; size?: "xs" | "sm" }) {
  return (
    <span
      className={cn("inline-flex max-w-full items-center truncate rounded-full font-semibold", size === "xs" ? "h-5 px-2 text-[10.5px]" : "h-6 px-2.5 text-xs")}
      style={{ background: shapeColors(color).bg, color: shapeColors(color).fg }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Check redondo (regra do workspace: todo check é redondo). `decorative` = só o desenho, para usar dentro de outro botão. */
export function RoundCheck({ checked, onChange, label, size = 20, disabled, decorative }: { checked: boolean; onChange?: () => void; label: string; size?: number; disabled?: boolean; decorative?: boolean }) {
  if (decorative) {
    return (
      <span
        aria-hidden
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-colors", checked ? "border-success bg-success text-white" : "border-border-strong bg-surface")}
        style={{ width: size, height: size }}
      >
        {checked && <Check strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        checked ? "border-success bg-success text-white" : "border-border-strong bg-surface hover:border-success",
      )}
      style={{ width: size, height: size }}
    >
      {checked && <Check strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />}
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{children}</kbd>;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-surface px-6 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink">{icon}</span>
      <div className="grid gap-1">
        <p className="font-semibold">{title}</p>
        {text && <p className="max-w-sm text-sm text-fg-2">{text}</p>}
      </div>
      {action}
    </div>
  );
}
