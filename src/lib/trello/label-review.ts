export type ReviewLabel = { id: string; name: string; color: string; position: number };
export type SourceLabel = { id: string; externalId: string; targetId: string | null; status: string; name: string; color: string | null; boardId: string };
export type ReviewCard = { id: string; sourceLabels: string[]; labels: string[] };
export type LabelDecision = { group: string; mode: "keep" | "existing" | "new" | "ignore"; targetId: string; name: string; color: string };
export type LabelReviewGroup = { key: string; name: string; colors: string[]; sourceIds: string[]; targets: string[]; boards: number; cards: number };
export const labelNameKey = (name: string) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/[_\s]+/g, " ").toLowerCase();
export function labelGroups(sources: SourceLabel[], cards: ReviewCard[]): LabelReviewGroup[] {
  const groups = new Map<string, SourceLabel[]>();
  for (const source of sources) {
    // Unnamed labels have no shared meaning; review them individually.
    const key = source.name.trim() ? `name:${labelNameKey(source.name)}` : `unnamed:${source.externalId}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return [...groups].map(([key, labels]) => {
    const ids = new Set(labels.map((label) => label.externalId));
    return { key, name: labels[0].name.trim() || `Sem nome (${labels[0].externalId.slice(-6)})`, colors: [...new Set(labels.map((label) => label.color ?? "sem cor"))],
      sourceIds: [...ids], targets: [...new Set(labels.map((label) => label.targetId).filter((id): id is string => Boolean(id)))],
      boards: new Set(labels.map((label) => label.boardId)).size, cards: cards.filter((card) => card.sourceLabels.some((id) => ids.has(id))).length };
  }).sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name, "pt-BR"));
}
export function remapCardLabels(card: ReviewCard, before: Map<string, string | null>, after: Map<string, string | null>, changed: Set<string>): string[] {
  const removed = new Set(card.sourceLabels.filter((id) => changed.has(id)).map((id) => before.get(id)).filter(Boolean));
  const desired = new Set(card.labels.filter((id) => !removed.has(id)));
  for (const sourceId of card.sourceLabels) {
    const target = after.get(sourceId);
    if (target && (changed.has(sourceId) || card.labels.includes(target))) desired.add(target);
  }
  return [...desired].sort();
}
