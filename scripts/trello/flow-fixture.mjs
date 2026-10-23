import assert from "node:assert/strict";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL); assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const db = new PrismaClient(), action = process.argv[2], filename = "research/trello/local/rehearsal/flow-fixture.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  if (action === "setup") {
    const prefix = `fv_${Date.now()}`, boardId = `${prefix}_board`, clientId = `${prefix}_client`, sourceId = `${prefix}_source`, labelId = `${prefix}_label`;
    const columns = Object.fromEntries(["inbox", "approval", "next", "back", "done"].map((key) => [key, `${prefix}_${key}`]));
    const batchId = `${prefix}_batch`, name = `Ensaio de fluxo ${prefix}`, title = `Cópia de modelo ${prefix}`, storedName = `${prefix}.png`;
    await mkdir("storage", { recursive: true });
    await writeFile(`storage/${storedName}`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    await writeFile(filename, JSON.stringify({ prefix, boardId, clientId, sourceId, labelId, columns, batchId, name, title, storedName }));
    await db.client.create({ data: { id: clientId, name } }); await db.label.create({ data: { id: labelId, name: `Etiqueta ${prefix}`, color: "#123456" } });
    await db.board.create({ data: { id: boardId, name, clientId, columns: { create: Object.entries(columns).map(([key, id], position) => ({ id, name: `${key} original`, position, isDone: key === "done" })) } } });
    const number = (await db.card.aggregate({ _max: { number: true } }))._max.number + 1;
    await db.card.create({ data: { id: sourceId, number, boardId, columnId: columns.inbox, title: `Modelo ${prefix}`, isTemplate: true, description: "<p>Descrição preservada do modelo</p>", priority: "HIGH", estimatedMin: 45, coverColor: "#123456", dueDate: new Date("2020-01-01"),
      labels: { create: { labelId } }, checklists: { create: [{ title: "Preparação", position: 0, items: { create: [{ text: "Primeiro item", position: 0, done: true }, { text: "Segundo item", position: 1 }] } }, { title: "Revisão", position: 1, items: { create: { text: "Conferir", position: 0, done: true } } }] },
      attachments: { create: { id: `${prefix}_attachment`, name: "amostra.png", storedName, mime: "image/png", size: (await readFile(`storage/${storedName}`)).length } } } });
    await db.card.update({ where: { id: sourceId }, data: { coverAttachmentId: `${prefix}_attachment` } });
    await db.importBatch.create({ data: { id: batchId, source: "trello", sourceHash: "validation-only", status: "COMPLETED", plan: { validationFixture: true } } });
    await db.importedEntity.createMany({ data: [{ batchId, kind: "board", externalId: `${prefix}_external_board`, targetId: boardId, status: "IMPORTED", original: {} }, ...Object.values(columns).map((id) => ({ batchId, kind: "column", externalId: `${id}_external`, targetId: id, status: "IMPORTED", original: {} }))] });
    const fixture = { prefix, boardId, clientId, sourceId, labelId, columns, batchId, name, title, storedName, source: await db.card.findUnique({ where: { id: sourceId }, include: { attachments: true, labels: true, checklists: { include: { items: true } } } }) };
    await writeFile(filename, JSON.stringify(fixture, null, 2)); console.log(JSON.stringify(fixture));
  } else {
    const f = JSON.parse(await readFile(filename, "utf8")); assert.match(f.prefix, /^fv_\d+$/); assert.equal(f.boardId, `${f.prefix}_board`);
    const card = await db.card.findFirst({ where: { boardId: f.boardId, title: f.title, isTemplate: false }, include: { attachments: true, labels: true, checklists: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } }, approvalPost: { include: { rounds: true } } } });
    if (action === "check-template") {
      assert.ok(card); assert.equal(card.title, f.title); assert.equal(card.description, f.source.description); assert.equal(card.priority, "HIGH"); assert.equal(card.estimatedMin, 45); assert.equal(card.dueDate, null); assert.equal(card.isTemplate, false);
      assert.deepEqual(card.checklists.map((l) => [l.title, l.items.map((i) => [i.text, i.done])]), [["Preparação", [["Primeiro item", false], ["Segundo item", false]]], ["Revisão", [["Conferir", false]]]]);
      assert.deepEqual(card.labels.map((l) => l.labelId), [f.labelId]); assert.equal(card.attachments.length, 1);
      assert.notEqual(card.attachments[0].storedName, f.storedName); assert.equal(card.coverAttachmentId, card.attachments[0].id);
      assert.equal(hash(await readFile(`storage/${card.attachments[0].storedName}`)), hash(await readFile(`storage/${f.storedName}`)));
      const original = await db.card.findUnique({ where: { id: f.sourceId }, include: { attachments: true, labels: true, checklists: { include: { items: true } } } });
      assert.equal(JSON.stringify(original), JSON.stringify(f.source));
      console.log(JSON.stringify({ cardId: card.id, independentFiles: true, originalPreserved: true, groupedChecklists: true }));
    } else if (action === "add-review-cards") {
      await db.column.create({ data: { id: `${f.prefix}_archived`, boardId: f.boardId, name: "Arquivo de teste", archivedAt: new Date(), position: 99 } });
      const max = (await db.card.aggregate({ _max: { number: true } }))._max.number;
      await db.card.createMany({ data: [{ id: `${f.prefix}_operational`, title: `Operacional ${f.prefix}`, boardId: f.boardId, columnId: f.columns.inbox, number: max + 1 }, { id: `${f.prefix}_historical`, title: `Historico ${f.prefix}`, boardId: f.boardId, columnId: `${f.prefix}_archived`, number: max + 2 }] });
      console.log(JSON.stringify({ ready: true }));
    } else if (action === "check-order") {
      const columns = await db.column.findMany({ where: { boardId: f.boardId, archivedAt: null }, orderBy: { position: "asc" } });
      assert.equal(columns[0].id, f.columns.approval); assert.equal(columns[1].id, f.columns.inbox);
      assert.equal((await db.column.findUnique({ where: { id: `${f.prefix}_archived` } })).position, 99);
      console.log(JSON.stringify({ reorderedWithArchive: true }));
    } else if (action === "check-copy") {
      const copy = await db.board.findFirstOrThrow({ where: { name: `Copia revisao ${f.prefix}`, clientId: f.clientId }, include: { columns: true, cards: true } });
      assert.equal(copy.columns.length, 5); assert.equal(copy.cards.length, 1); assert.equal(copy.cards[0].title, `Operacional ${f.prefix}`);
      console.log(JSON.stringify({ copyId: copy.id, excludedArchivedAndTemplates: true }));
    } else if (action === "check-board-template") {
      const template = await db.boardTemplate.findFirstOrThrow({ where: { name: `Modelo revisao ${f.prefix}` } });
      assert.equal(JSON.parse(template.columns).length, 5); const cards = JSON.parse(template.cards); assert.equal(cards.length, 1); assert.equal(cards[0].title, `Operacional ${f.prefix}`);
      console.log(JSON.stringify({ excludedArchivedAndTemplates: true }));
    } else if (action === "probe") console.log(JSON.stringify({ cardId: card?.id, columnId: card?.columnId, completedAt: card?.completedAt, post: card?.approvalPost }));
    else if (action === "shuffle") {
      for (const [key, id] of Object.entries(f.columns)) await db.column.update({ where: { id }, data: { name: `Destino ${key} renomeado`, position: 20 - Object.keys(f.columns).indexOf(key) } });
      console.log(JSON.stringify({ shuffled: true }));
    } else if (action === "cleanup") {
      const board = await db.board.findUnique({ where: { id: f.boardId } }); assert.equal(board?.name, f.name);
      const copies = await db.board.findMany({ where: { name: `Copia revisao ${f.prefix}`, clientId: f.clientId } });
      for (const copy of copies) { assert.ok(copy.createdAt.getTime() >= Number(f.prefix.slice(3))); await db.board.delete({ where: { id: copy.id } }); }
      await db.boardTemplate.deleteMany({ where: { name: `Modelo revisao ${f.prefix}` } });
      const cards = await db.card.findMany({ where: { boardId: f.boardId }, include: { attachments: true, approvalPost: { include: { rounds: { include: { files: true } } } } } });
      const files = [...new Set(cards.flatMap((c) => [...c.attachments.map((a) => a.storedName), ...(c.approvalPost?.rounds.flatMap((r) => r.files.map((a) => a.storedName)) ?? [])]))];
      await db.notification.deleteMany({ where: { cardId: { in: cards.map((c) => c.id) } } });
      await db.approvalPost.deleteMany({ where: { cardId: { in: cards.map((c) => c.id) } } });
      await db.importedEntity.deleteMany({ where: { batchId: f.batchId } }); await db.importBatch.delete({ where: { id: f.batchId } });
      await db.board.delete({ where: { id: f.boardId } }); await db.client.delete({ where: { id: f.clientId } }); await db.label.delete({ where: { id: f.labelId } });
      await db.appSetting.deleteMany({ where: { key: `boardApprovalFlow:${f.boardId}` } });
      for (const storedName of files) { assert.match(storedName, /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/); await unlink(`storage/${storedName}`).catch(() => {}); }
      console.log(JSON.stringify({ cleaned: true, cards: cards.length }));
    } else throw new Error("Unknown action");
  }
} finally { await db.$disconnect(); }
