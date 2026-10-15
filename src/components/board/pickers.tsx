"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Flag, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { EXTRA_PALETTE, PALETTE, PRIORITIES, PRIORITY_META, inkOn, type Priority } from "@/lib/domain";
import { addDays, todayKey } from "@/lib/dates";
import { Avatar, Button, LabelChip, RoundCheck } from "@/components/ui/basics";
import { MenuItem, Popover, useFeedback } from "@/components/ui/overlay";
import { createLabel } from "@/app/actions/team";
import { createClient } from "@/app/actions/clients";
import { useLookups } from "./lookups";
import { shapeColors } from "@/lib/color";

/** Botão que abre um popover. `render` recebe a função de fechar. */
export function PopoverButton({
  button,
  children,
  width,
  align,
  className,
  label,
}: {
  button: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  width?: number;
  align?: "start" | "end";
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" aria-label={label} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className={className}>
        {button}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={width} align={align}>
        {children(() => setOpen(false))}
      </Popover>
    </>
  );
}

export function AssigneeList({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { users, me } = useLookups();
  const [q, setQ] = useState("");
  const list = users
    .filter((u) => u.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));
  return (
    <div className="grid gap-1">
      {users.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Buscar pessoa" />}
      <div className="grid max-h-72 gap-0.5 overflow-y-auto scroll-thin">
        {list.map((u) => {
          const on = selected.includes(u.id);
          return (
            <button key={u.id} type="button" onClick={() => onToggle(u.id)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface-2">
              <Avatar user={u} size={26} />
              <span className="min-w-0 flex-1 truncate">{u.name}{u.id === me.id && <span className="text-fg-3"> (você)</span>}</span>
              <RoundCheck checked={on} label={u.name} size={18} decorative />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LabelList({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { labels, addLabel } = useLookups();
  const { toast } = useFeedback();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [color, setColor] = useState(PALETTE[6]);
  const list = labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));

  const create = async () => {
    const name = q.trim();
    if (!name) return;
    const res = await createLabel({ name, color });
    if (!res.ok) return toast(res.error, "error");
    addLabel(res.data);
    onToggle(res.data.id);
    setQ("");
    setCreating(false);
  };

  return (
    <div className="grid gap-1">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar ou criar etiqueta" onEnter={() => (list.length === 0 ? (creating ? create() : setCreating(true)) : onToggle(list[0].id))} />
      <div className="grid max-h-64 gap-0.5 overflow-y-auto scroll-thin">
        {list.map((l) => (
          <button key={l.id} type="button" onClick={() => onToggle(l.id)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
            <span className="min-w-0 flex-1 text-left"><LabelChip name={l.name} color={l.color} /></span>
            <RoundCheck checked={selected.includes(l.id)} label={l.name} size={18} decorative />
          </button>
        ))}
        {list.length === 0 && !creating && <p className="px-2 py-2 text-sm text-fg-3">Nenhuma etiqueta com esse nome.</p>}
      </div>
      {q.trim() && !labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase()) && (
        creating ? (
          <div className="grid gap-2 rounded-xl bg-surface-2 p-2">
            <ColorGrid value={color} onChange={(c) => c && setColor(c)} />
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1"><LabelChip name={q.trim()} color={color} /></span>
              <Button size="sm" variant="primary" onClick={create}>Criar</Button>
            </div>
          </div>
        ) : (
          <MenuItem icon={<Plus />} onClick={() => setCreating(true)}>Criar etiqueta &quot;{q.trim()}&quot;</MenuItem>
        )
      )}
    </div>
  );
}

/** Escolher (ou criar na hora) o cliente da demanda. */
export function ClientList({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { clients, addClient } = useLookups();
  const { toast } = useFeedback();
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const list = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const exact = clients.some((c) => c.name.toLowerCase() === q.trim().toLowerCase());

  const create = async () => {
    const name = q.trim();
    if (name.length < 2 || saving) return;
    setSaving(true);
    const res = await createClient({ name, color: PALETTE[clients.length % PALETTE.length] });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    addClient(res.data);
    onChange(res.data.id);
  };

  return (
    <div className="grid gap-1">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar ou cadastrar cliente" onEnter={() => (list.length && !q.trim() ? onChange(list[0].id) : list.length === 1 ? onChange(list[0].id) : !exact && create())} />
      <div className="grid max-h-64 gap-0.5 overflow-y-auto scroll-thin">
        {list.map((c) => (
          <MenuItem key={c.id} active={value === c.id} icon={<ClientDot color={c.color} imageUrl={c.imageUrl} />} onClick={() => onChange(c.id)} hint={value === c.id ? <Check className="size-4 text-fg-2" /> : null}>
            {c.name}
          </MenuItem>
        ))}
        {clients.length === 0 && !q && <p className="px-2.5 py-2 text-sm text-fg-3">Nenhum cliente ainda. Digite o nome para cadastrar.</p>}
      </div>
      {q.trim().length >= 2 && !exact && (
        <MenuItem icon={<Plus />} onClick={create}>
          Cadastrar &quot;{q.trim()}&quot;
        </MenuItem>
      )}
      {value && (
        <>
          <div className="my-1 h-px bg-border" />
          <MenuItem onClick={() => onChange(null)}>Sem cliente</MenuItem>
        </>
      )}
    </div>
  );
}

export function ClientDot({ color, size = 10, imageUrl }: { color: string; size?: number; imageUrl?: string | null }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="inline-block shrink-0 rounded-full object-cover" style={{ width: size + 6, height: size + 6 }} />;
  }
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

/** Pílula do cliente (nome + ponto sólido na cor do cliente). */
export function ClientPill({ name, color, imageUrl, size = "sm" }: { name: string; color: string; imageUrl?: string | null; size?: "xs" | "sm" }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 font-medium text-fg-2", size === "xs" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-xs")}>
      <ClientDot color={color} imageUrl={imageUrl} size={size === "xs" ? 8 : 9} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function PriorityList({ value, onChange }: { value: string | null; onChange: (p: Priority | null) => void }) {
  return (
    <div className="grid gap-0.5">
      {PRIORITIES.map((p) => (
        <MenuItem key={p} icon={<PriorityIcon priority={p} />} onClick={() => onChange(p)} active={value === p} hint={value === p ? <Check className="size-4 text-fg-2" /> : null}>
          {PRIORITY_META[p].label}
        </MenuItem>
      ))}
      <div className="my-1 h-px bg-border" />
      <MenuItem onClick={() => onChange(null)} active={!value}>Sem prioridade</MenuItem>
    </div>
  );
}

/** Ícone de prioridade: círculo sólido com a bandeira em contraste. */
export function PriorityIcon({ priority, size = 18 }: { priority: string | null; size?: number }) {
  if (!priority || !(priority in PRIORITY_META)) return null;
  const meta = PRIORITY_META[priority as Priority];
  return (
    <span title={`Prioridade ${meta.label.toLowerCase()}`} className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: shapeColors(meta.color).bg, color: shapeColors(meta.color).fg }}>
      <Flag style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.5} />
    </span>
  );
}

export function DateList({ value, onChange, allowClear = true }: { value: string | null; onChange: (key: string | null) => void; allowClear?: boolean }) {
  const today = todayKey();
  const nextMonday = (() => {
    const d = new Date();
    const add = ((8 - d.getDay()) % 7) || 7;
    return addDays(today, add);
  })();
  const quick: [string, string][] = [
    ["Hoje", today],
    ["Amanhã", addDays(today, 1)],
    ["Próxima segunda", nextMonday],
    ["Daqui a 1 semana", addDays(today, 7)],
  ];
  return (
    <div className="grid gap-1">
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <div className="grid gap-0.5">
        {quick.map(([label, key]) => (
          <MenuItem key={label} onClick={() => onChange(key)} active={value === key}>{label}</MenuItem>
        ))}
        {allowClear && value && (
          <>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={() => onChange(null)} danger>Tirar data</MenuItem>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Cores sugeridas (família verde-água + outros tons) e um "+" para escolher qualquer cor.
 * A cor livre só é aplicada quando a pessoa fecha o seletor do sistema (não grava a cada arraste).
 */
export function ColorGrid({ value, onChange, allowNone, size = 26, extra = true }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean; size?: number; extra?: boolean }) {
  const all = extra ? [...PALETTE, ...EXTRA_PALETTE] : PALETTE;
  const custom = value && !all.some((c) => c.toLowerCase() === value.toLowerCase()) ? value : null;
  const swatch = (c: string, label: string) => (
    <button
      key={c}
      type="button"
      aria-label={label}
      aria-pressed={value?.toLowerCase() === c.toLowerCase()}
      onClick={() => onChange(c)}
      className={cn("inline-flex items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110", value?.toLowerCase() === c.toLowerCase() && "ring-2 ring-fg")}
      style={{ width: size, height: size, background: c, color: inkOn(c) }}
    >
      {value?.toLowerCase() === c.toLowerCase() && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
  return (
    // p-1: o anel da cor escolhida (ring + offset) não pode encostar na borda de áreas com rolagem, que cortam
    <div className="flex flex-wrap gap-1.5 p-1">
      {allowNone && (
        <button
          type="button"
          aria-label="Sem cor"
          aria-pressed={!value}
          onClick={() => onChange(null)}
          className={cn("rounded-full bg-surface-3 ring-offset-2 ring-offset-surface", !value && "ring-2 ring-fg")}
          style={{ width: size, height: size }}
        />
      )}
      {all.map((c) => swatch(c, `Cor ${c}`))}
      {custom && swatch(custom, `Cor escolhida ${custom}`)}
      <CustomColor size={size} value={value} onPick={onChange} />
    </div>
  );
}

function CustomColor({ size, value, onPick }: { size: number; value: string | null; onPick: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "change" (fechou o seletor), não "input" (cada movimento)
    const commit = () => pickRef.current(el.value.toUpperCase());
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, []);
  return (
    <label
      title="Escolher outra cor"
      className="relative inline-flex cursor-pointer items-center justify-center rounded-full border-2 border-border-strong bg-surface text-fg-2 transition-colors hover:border-fg-3 hover:text-fg"
      style={{ width: size, height: size }}
    >
      <Plus className="size-3.5" strokeWidth={2.5} />
      <span className="sr-only">Escolher outra cor</span>
      <input ref={ref} type="color" defaultValue={value ?? "#19C9A9"} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

function SearchBox({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-2.5">
      <Search className="size-4 text-fg-3" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
      />
    </div>
  );
}
