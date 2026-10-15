// Constantes e utilidades usadas no servidor e no navegador.
import { readableOn } from "./color";

export const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

// Prioridade na escala do verde-água: quanto mais urgente, mais escuro (o texto em contraste vem de inkOn).
export const PRIORITY_META: Record<Priority, { label: string; color: string; rank: number }> = {
  URGENT: { label: "Urgente", color: "#0F3B36", rank: 0 },
  HIGH: { label: "Alta", color: "#0B9A82", rank: 1 },
  MEDIUM: { label: "Média", color: "#19C9A9", rank: 2 },
  LOW: { label: "Baixa", color: "#9ADBC5", rank: 3 },
};

export const REPEATS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { DAILY: "Todo dia", WEEKLY: "Toda semana", MONTHLY: "Todo mês" };

/**
 * Paleta sólida da família verde-água (etiquetas, capas, colunas, quadros, avatares).
 * Todas aceitam texto branco ou escuro com contraste (ver inkOn).
 */
export const PALETTE = [
  "#19C9A9", "#0B9A82", "#0E7C6B", "#6FE3CD", "#3BB3C3", "#1F8FA8",
  "#155E75", "#34C38F", "#1E7F4F", "#9ADBC5", "#0F3B36", "#5B7F7A",
];

/** Mais tons sugeridos além da família verde-água (o botão + aceita qualquer cor). */
export const EXTRA_PALETTE = [
  "#2F6FDB", "#5B4FD6", "#8E44AD", "#C2185B", "#E0457B", "#D93A3A",
  "#F0654A", "#F28C28", "#F2B705", "#5E9E2B", "#8A6D3B", "#4B5563",
];

/** Paleta anterior (multicolorida), na mesma ordem: usada só para migrar dados antigos. */
export const LEGACY_PALETTE = [
  "#FAA422", "#E8710A", "#D93A3A", "#C2185B", "#8E44AD", "#5B4FD6",
  "#2F6FDB", "#0E8FA8", "#14946B", "#5E9E2B", "#8A6D3B", "#4B5563",
];

export const INK_DARK = "#050505";

/**
 * Cor do texto sobre um fundo colorido, escolhida pela leitura percebida (APCA, ver src/lib/color.ts).
 * Para shapes com texto, prefira shapeColors(), que também ajusta o fundo quando nem branco nem escuro leem bem.
 */
export function inkOn(hex: string) {
  return readableOn(hex);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const ACTIVITY_TEXT: Record<string, (d: Record<string, string>) => string> = {
  created: (d) => `criou a demanda em ${d.column ?? "uma coluna"}`,
  moved: (d) => `moveu de ${d.from} para ${d.to}`,
  moved_board: (d) => `levou do quadro ${d.from} para ${d.to}`,
  completed: () => "concluiu a demanda",
  reopened: () => "reabriu a demanda",
  archived: () => "arquivou a demanda",
  restored: () => "restaurou a demanda",
  renamed: (d) => `renomeou para "${d.to}"`,
  due: (d) => (d.to ? `mudou o prazo para ${d.to}` : "tirou o prazo"),
  priority: (d) => (d.to ? `mudou a prioridade para ${d.to}` : "tirou a prioridade"),
  assigned: (d) => `adicionou ${d.name} como responsável`,
  unassigned: (d) => `tirou ${d.name} dos responsáveis`,
  attachment: (d) => `anexou ${d.name}`,
  repeat_spawned: (d) => `gerou a próxima repetição (#${d.number})`,
  duplicated: (d) => `duplicou a partir de #${d.number}`,
  client: (d) => (d.name ? `ligou ao cliente ${d.name}` : "tirou o cliente"),
  approval_sent: (d) => (Number(d.round) > 1 ? `enviou a versão ${d.round} para o cliente aprovar` : "enviou para o cliente aprovar"),
  approval_canceled: () => "arquivou a aprovação do cliente",
  approval_published: () => "marcou o post como publicado",
  approval_approved: () => "aprovou pelo link do cliente",
  approval_changes: (d) => (d.comment ? `pediu ajustes pelo link do cliente: "${d.comment}"` : "pediu ajustes pelo link do cliente"),
};

// ---------- aprovação de posts ----------
export const APPROVAL_FORMATS = [
  ["IMAGEM", "Post"], ["CARROSSEL", "Carrossel"], ["REELS", "Reels"], ["STORIES", "Stories"], ["VIDEO", "Vídeo"], ["TEXTO", "Só texto"],
] as const;
export const APPROVAL_FORMAT_LABEL: Record<string, string> = Object.fromEntries(APPROVAL_FORMATS);
/** Situação da aprovação: rótulo e cor sólida (texto em contraste vem de shapeColors). */
export const APPROVAL_META: Record<string, { label: string; short: string; color: string }> = {
  PENDING: { label: "Aguardando o cliente", short: "Para aprovar", color: "#F2B705" },
  CHANGES: { label: "Cliente pediu ajustes", short: "Em ajuste", color: "#E0533D" },
  APPROVED: { label: "Aprovado pelo cliente", short: "Aprovado", color: "#1E7F4F" },
  PUBLISHED: { label: "Publicado", short: "Publicado", color: "#0F1A19" },
  CANCELED: { label: "Arquivado", short: "Arquivado", color: "#84979B" },
};
/** Colunas das telas de aprovação, na ordem do fluxo. */
export const APPROVAL_FLOW = ["PENDING", "CHANGES", "APPROVED", "PUBLISHED"] as const;
export const APPROVAL_FLOW_HINT: Record<string, { team: string; client: string }> = {
  PENDING: { team: "esperando o cliente", client: "esperam a sua decisão" },
  CHANGES: { team: "o cliente pediu ajuste", client: "a equipe está ajustando" },
  APPROVED: { team: "prontos para publicar", client: "prontos para publicar" },
  PUBLISHED: { team: "já estão no ar", client: "já estão no ar" },
};
