// Datas guardadas como meia-noite UTC do dia escolhido (prazo é "dia", não horário).
// Toda leitura/escrita passa por aqui para o dia não pular por causa do fuso.

export function toDayKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function fromDayKey(key: string | null | undefined): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return new Date(`${key}T00:00:00.000Z`);
}

/** Dia de hoje no fuso de quem está usando (navegador) ou do servidor. */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, n: number) {
  const d = fromDayKey(key)!;
  d.setUTCDate(d.getUTCDate() + n);
  return toDayKey(d)!;
}

export function diffDays(a: string, b: string) {
  return Math.round((fromDayKey(a)!.getTime() - fromDayKey(b)!.getTime()) / 86400000);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function shortDay(key: string, today = todayKey()) {
  const diff = diffDays(key, today);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = y === Number(today.slice(0, 4));
  return `${d} ${MONTHS[m - 1]}${sameYear ? "" : ` ${y}`}`;
}

export type DueState = "done" | "late" | "today" | "soon" | "later";

export function dueState(dueKey: string | null, completed: boolean, today = todayKey()): DueState | null {
  if (!dueKey) return null;
  if (completed) return "done";
  const diff = diffDays(dueKey, today);
  if (diff < 0) return "late";
  if (diff === 0) return "today";
  if (diff <= 2) return "soon";
  return "later";
}

export function relativeTime(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
