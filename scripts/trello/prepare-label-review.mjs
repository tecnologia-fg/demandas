import { readFile, writeFile } from "node:fs/promises";
const root = "research/trello/local/api-capture/2026-10-22";
const manifest = JSON.parse(await readFile(`${root}/reports/import-sources.json`, "utf8"));
const normalize = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/[_\s]+/g, " ").toLowerCase();
const groups = new Map();
for (const source of manifest.boards) {
  const board = JSON.parse(await readFile(`${root}/${source.file}`, "utf8"));
  for (const label of board.labels) {
    const key = label.name.trim() ? normalize(label.name) : "unnamed";
    const group = groups.get(key) ?? { key, names: new Set(), colors: new Set(), sourceLabels: [], cards: new Set(), boards: new Set() };
    group.names.add(label.name || "Sem nome"); group.colors.add(label.color ?? "Sem cor"); group.boards.add(board.id);
    group.sourceLabels.push({ id: label.id, boardId: board.id, name: label.name, color: label.color });
    for (const card of board.cards) if (card.idLabels.includes(label.id)) group.cards.add(card.id);
    groups.set(key, group);
  }
}
const review = [...groups.values()].map((g) => ({ ...g, names: [...g.names], colors: [...g.colors], cards: g.cards.size, boards: g.boards.size,
  proposedAction: g.key === "unnamed" ? "review_ignore_unnamed" : "consolidate_same_normalized_name", status: "proposed" })).sort((a, b) => b.cards - a.cards);
await writeFile("research/trello/local/vps/label-review.proposed.json", JSON.stringify({ status: "proposed", groups: review }, null, 2));
await writeFile("research/trello/local/vps/label-review.proposed.md", ["# Revisão proposta de etiquetas", "", "A VPS não tem etiquetas cadastradas. Proposta: consolidar nomes equivalentes, escolhendo uma cor por grupo. Nada foi aplicado.", "",
  "| Nomes na origem | Definições | Cards | Cores | Proposta |", "|---|---:|---:|---|---|", ...review.map((g) => `| ${g.names.join(" / ")} | ${g.sourceLabels.length} | ${g.cards} | ${g.colors.join(", ")} | ${g.key === "unnamed" ? "Revisar e deixar sem associação" : "Uma etiqueta por nome equivalente"} |`), "",
  "STORY/STORIES, URGENTE/URGÊNCIA e AJUSTE/ALTERAÇÃO permanecem em grupos separados até decisão explícita. Etiquetas com cores diferentes estão identificadas para escolha, sem descarte automático.",
].join("\n") + "\n");
console.log(JSON.stringify({ sourceDefinitions: review.reduce((sum, g) => sum + g.sourceLabels.length, 0), proposedNamedGroups: review.filter((g) => g.key !== "unnamed").length, unnamedDefinitions: review.find((g) => g.key === "unnamed")?.sourceLabels.length, applied: false }));
