import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const root = "research/trello/local/api-capture/2026-10-22";
const catalog = await read("research/trello/local/vps/destination-catalog.json");
const members = await read(`${root}/workspace-members.json`), profiles = await read(`${root}/members.json`);
const manifest = await read(`${root}/reports/import-sources.json`);
// Explicit review candidates, not fuzzy matches that silently bind historical accounts.
const pairs = [
  ["Ariana", "ariana.petit"], ["Guilherme Rodrigues Santos", "guilhermesantos"],
  ["Gustavo Moura", "gustavo.moura"], ["Jaci Feitosa", "jaci.feitosa"],
  ["João Pedro - Criação", "joao.pedro"], ["Larissa Oliveira", "larissa.oliveira"],
  ["Michael Alberto", "michael.alberto"], ["Natalia Lopes Bassi", "natalia.bassi"],
  ["Paula Rodrigues Vieira", "paula.rodrigues"], ["Pitter Sol", "pitter.sol"],
  ["Saulo Freitas", "saulo.freitas"], ["Wilian Nascimento da Silva", "wilian.silva"],
];
const associations = pairs.map(([name, email]) => {
  const source = members.filter((m) => m.fullName === name), target = catalog.users.filter((u) => u.email === `${email}@formulagroup.com.br`);
  assert.equal(source.length, 1); assert.equal(target.length, 1);
  return { sourcePersonId: source[0].id, sourceName: name, targetUserId: target[0].id, targetName: target[0].name, targetEmail: target[0].email, status: "proposed", assignments: 0, comments: 0 };
});
const mapped = new Map(associations.map((a) => [a.sourcePersonId, a]));
let assignedCards = 0, mappedCards = 0, mappedComments = 0, externalComments = 0;
for (const entry of manifest.boards) {
  const board = await read(`${root}/${entry.file}`);
  for (const card of board.cards) {
    if (card.idMembers.length) assignedCards++;
    if (card.idMembers.some((id) => mapped.has(id))) mappedCards++;
    for (const id of card.idMembers) if (mapped.has(id)) mapped.get(id).assignments++;
  }
  for (const action of board.actions.filter((a) => a.type === "commentCard")) {
    const author = mapped.get(action.idMemberCreator ?? action.memberCreator?.id);
    if (author) { author.comments++; mappedComments++; } else externalComments++;
  }
}
const external = profiles.filter((p) => !mapped.has(p.id)).map((p) => ({ sourcePersonId: p.id, name: p.fullName ?? p.username ?? p.id, action: "preserve_external_identity" }));
const report = { kind: "dmanda-trello-user-review", schemaVersion: 1, status: "proposed", generatedAt: new Date().toISOString(),
  summary: { destinationUsers: catalog.users.length, proposedAssociations: associations.length, assignedCards, mappedCards, mappedComments, externalComments, externalIdentities: external.length }, associations, external };
await writeFile("research/trello/local/vps/user-associations.proposed.json", JSON.stringify(report, null, 2));
await writeFile("research/trello/local/vps/user-associations.proposed.md", ["# Associações propostas de usuários", "", "Proposta local. Nenhuma conta foi alterada e estas associações ainda não foram aplicadas.", "",
  "| Trello | Usuário na VPS | Cards atribuídos | Comentários |", "|---|---|---:|---:|", ...associations.map((a) => `| ${a.sourceName} | ${a.targetName} | ${a.assignments} | ${a.comments} |`), "",
  `Cobertura: ${mappedCards}/${assignedCards} cards com responsáveis; ${mappedComments} comentários vinculáveis à equipe; ${externalComments} comentários preservados com autoria externa.`, "",
  "A conta Deputada Leci Brandão é externa à equipe. As demais identidades históricas também permanecem externas; nomes semelhantes não foram associados automaticamente.",
].join("\n") + "\n");
console.log(JSON.stringify(report.summary));
