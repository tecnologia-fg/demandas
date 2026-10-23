import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const db = new PrismaClient();
try {
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: "trello_20261022_rehearsal" } });
  const associationReview = await db.importBatch.findUnique({ where: { id: "trello_clients_labels_review_20261023" } });
  const correction = await db.importBatch.findUnique({ where: { id: "trello_clients_correction_20261023" } });
  const approved = correction?.status === "APPLIED" ? correction.plan.approved : associationReview?.status === "APPLIED" ? associationReview.plan.approved : null;
  const imported = await db.importedEntity.findMany({ where: { batchId: batch.id, kind: { in: ["board", "card", "label", "identity"] } }, select: { kind: true, externalId: true, targetId: true, status: true, original: true } });
  const boardRows = imported.filter((r) => r.kind === "board"), cardRows = imported.filter((r) => r.kind === "card"), labelRows = imported.filter((r) => r.kind === "label");
  const boards = await db.board.findMany({ where: { id: { in: boardRows.map((r) => r.targetId) } }, include: { client: { select: { name: true } }, _count: { select: { cards: true } } } });
  const cards = await db.card.findMany({ where: { id: { in: cardRows.map((r) => r.targetId) } }, select: { id: true, boardId: true, assignees: { select: { userId: true } } } });
  const details = boards.map((b) => {
    const originals = cardRows.filter((r) => r.original.idBoard === boardRows.find((r) => r.targetId === b.id).externalId);
    const suggestedClient = approved ? approved.withoutClient.includes(b.name) ? null : approved.clientGroups.find((g) => g.boards.includes(b.name))?.name ?? b.name
      : b.name.startsWith("_") ? null : b.name.startsWith("SPMAR") ? "SPMAR" : b.name;
    return { name: b.name, archived: !!b.archivedAt, client: b.client?.name ?? null, suggestedClient,
      cards: b._count.cards, cardsWithTrelloAssignees: originals.filter((r) => r.original.idMembers?.length).length,
      cardsWithDmandaAssignees: cards.filter((c) => c.boardId === b.id && c.assignees.length).length };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const report = { reviewedAt: new Date().toISOString(), provisional: batch.plan.provisional === true,
    boards: boards.length, linkedClientBoards: details.filter((b) => b.client).length,
    sourceCardsWithAssignees: cardRows.filter((r) => r.original.idMembers?.length).length, cardsWithDmandaAssignees: cards.filter((c) => c.assignees.length).length,
    externalIdentities: imported.filter((r) => r.kind === "identity" && !r.targetId).length,
    labels: { sourceDefinitions: labelRows.length, destinationLabels: new Set(labelRows.map((r) => r.targetId).filter(Boolean)).size, explicitlyReviewed: labelRows.filter((r) => ["MAPPED", "IGNORED"].includes(r.status)).length }, details };
  const markdown = ["# Revisão das associações locais", "", `Revisado em ${report.reviewedAt}. Lote provisório: ${report.provisional ? "sim" : "não"}.`, "",
    `Quadros com cliente: ${report.linkedClientBoards}/${report.boards}. Cards com responsável na origem: ${report.sourceCardsWithAssignees}; com responsável local: ${report.cardsWithDmandaAssignees}.`, "",
    approved ? "As associações abaixo foram aprovadas e aplicadas somente no ensaio local. Cafu Academy e Cafu Camp têm clientes separados. A carga original continua identificada como provisória; o plano revisado está em reviewed-plan.json." : "Os clientes sugeridos abaixo são propostas pelo nome do quadro; não foram criados nem associados automaticamente.", "",
    "| Quadro | Cliente atual | Cliente sugerido | Cards | Com responsável no Trello | Com responsável local |", "|---|---|---|---:|---:|---:|",
    ...details.map((b) => `| ${b.name.replaceAll("|", "/")} | ${b.client ?? "—"} | ${b.suggestedClient ?? "— (interno)"} | ${b.cards} | ${b.cardsWithTrelloAssignees} | ${b.cardsWithDmandaAssignees} |`)];
  await writeFile("research/trello/local/rehearsal/release-review.json", JSON.stringify(report, null, 2));
  await writeFile("research/trello/local/rehearsal/association-review.md", markdown.join("\n") + "\n");
  console.log(JSON.stringify({ ...report, details: undefined }));
} finally { await db.$disconnect(); }
