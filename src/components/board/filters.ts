import { addDays, todayKey } from "@/lib/dates";
import type { CardSummary } from "@/lib/types";

export type Filters = {
  q: string;
  assignees: string[]; // "none" = sem responsável
  labels: string[];
  clients: string[]; // "none" = sem cliente
  priorities: string[]; // "none" = sem prioridade
  due: "" | "late" | "today" | "week" | "none";
  hideDone: boolean;
};

export const EMPTY_FILTERS: Filters = { q: "", assignees: [], labels: [], clients: [], priorities: [], due: "", hideDone: false };

export function activeFilterCount(f: Filters) {
  return f.assignees.length + f.labels.length + f.clients.length + f.priorities.length + (f.due ? 1 : 0) + (f.hideDone ? 1 : 0);
}

export function matches(card: CardSummary, f: Filters, today = todayKey()) {
  if (f.q) {
    const q = f.q.toLowerCase().replace(/^#/, "");
    if (!card.title.toLowerCase().includes(q) && String(card.number) !== q) return false;
  }
  if (f.assignees.length) {
    const ok = f.assignees.some((a) => (a === "none" ? card.assigneeIds.length === 0 : card.assigneeIds.includes(a)));
    if (!ok) return false;
  }
  if (f.labels.length && !f.labels.some((l) => card.labelIds.includes(l))) return false;
  if (f.clients.length && !f.clients.some((c) => (c === "none" ? !card.clientId : card.clientId === c))) return false;
  if (f.priorities.length && !f.priorities.some((p) => (p === "none" ? !card.priority : card.priority === p))) return false;
  if (f.hideDone && card.completedAt) return false;
  if (f.due) {
    const d = card.dueDate;
    if (f.due === "none") return !d;
    if (!d) return false;
    if (f.due === "late") return d < today && !card.completedAt;
    if (f.due === "today") return d === today;
    if (f.due === "week") return d >= today && d <= addDays(today, 7);
  }
  return true;
}
