"use client";

import { cn } from "@/lib/cn";
import { PRIORITIES, PRIORITY_META } from "@/lib/domain";
import { Avatar, LabelChip } from "@/components/ui/basics";
import { EMPTY_FILTERS, activeFilterCount, type Filters } from "./filters";
import { PriorityIcon } from "./pickers";
import { useLookups } from "./lookups";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors", on ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2 hover:text-fg")}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterPanel({ filters, setFilters }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>> }) {
  const { users, labels, clients, me } = useLookups();
  const onlyMine = filters.assignees.length === 1 && filters.assignees[0] === me.id;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Filtros</p>
        {activeFilterCount(filters) > 0 && (
          <button type="button" onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))} className="rounded-full px-2 py-1 text-xs font-medium text-fg-2 hover:bg-surface-2 hover:text-fg">
            Limpar tudo
          </button>
        )}
      </div>

      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Responsáveis</p>
        <div className="flex flex-wrap gap-1.5">
          <Pill on={onlyMine} onClick={() => setFilters((f) => ({ ...f, assignees: onlyMine ? [] : [me.id] }))}>Só as minhas</Pill>
          <Pill on={filters.assignees.includes("none")} onClick={() => setFilters((f) => ({ ...f, assignees: toggle(f.assignees, "none") }))}>Sem responsável</Pill>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => {
            const on = filters.assignees.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                title={u.name}
                onClick={() => setFilters((f) => ({ ...f, assignees: toggle(f.assignees, u.id) }))}
                className={cn("rounded-full p-0.5 transition", on ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100")}
              >
                <Avatar user={u} size={30} />
              </button>
            );
          })}
        </div>
      </section>

      {clients.length > 0 && (
        <section className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Clientes</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto scroll-thin">
            {clients.map((c) => (
              <Pill key={c.id} on={filters.clients.includes(c.id)} onClick={() => setFilters((f) => ({ ...f, clients: toggle(f.clients, c.id) }))}>
                <span className="size-2 rounded-full" style={{ background: c.color }} /> {c.name}
              </Pill>
            ))}
            <Pill on={filters.clients.includes("none")} onClick={() => setFilters((f) => ({ ...f, clients: toggle(f.clients, "none") }))}>Sem cliente</Pill>
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Prazo</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["late", "Atrasadas"],
            ["today", "Hoje"],
            ["week", "Próximos 7 dias"],
            ["none", "Sem prazo"],
          ] as const).map(([v, label]) => (
            <Pill key={v} on={filters.due === v} onClick={() => setFilters((f) => ({ ...f, due: f.due === v ? "" : v }))}>{label}</Pill>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Prioridade</p>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITIES.map((p) => (
            <Pill key={p} on={filters.priorities.includes(p)} onClick={() => setFilters((f) => ({ ...f, priorities: toggle(f.priorities, p) }))}>
              <PriorityIcon priority={p} size={16} /> {PRIORITY_META[p].label}
            </Pill>
          ))}
        </div>
      </section>

      {labels.length > 0 && (
        <section className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => {
              const on = filters.labels.includes(l.id);
              return (
                <button key={l.id} type="button" aria-pressed={on} onClick={() => setFilters((f) => ({ ...f, labels: toggle(f.labels, l.id) }))} className={cn("rounded-full transition", on ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : "opacity-70 hover:opacity-100")}>
                  <LabelChip name={l.name} color={l.color} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
        Esconder concluídas
        <input type="checkbox" className="peer sr-only" checked={filters.hideDone} onChange={(e) => setFilters((f) => ({ ...f, hideDone: e.target.checked }))} />
        <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", filters.hideDone ? "bg-accent" : "bg-surface-3")}>
          <span className={cn("block size-4 rounded-full bg-white shadow transition-transform", filters.hideDone && "translate-x-4")} />
        </span>
      </label>
    </div>
  );
}
