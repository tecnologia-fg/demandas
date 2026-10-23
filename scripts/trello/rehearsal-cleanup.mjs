import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
assert.equal(process.env.TRELLO_REHEARSAL, "1");
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "db"); assert.equal(url.pathname, "/dmanda_trello_rehearsal");
const fixtures = JSON.parse(await readFile("research/trello/local/rehearsal/browser/fixtures.json", "utf8"));
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    for (const id of fixtures.users) {
      const user = await tx.user.findUnique({ where: { id } }); if (!user) continue;
      assert.ok(user.name.startsWith("Ensaio cadastro pessoa ")); assert.match(user.email, /^ensaio\.\d+@example\.invalid$/);
      assert.equal(await tx.cardAssignee.count({ where: { userId: id } }), 0); assert.equal(await tx.comment.count({ where: { userId: id } }), 0);
      await tx.user.delete({ where: { id } });
    }
    for (const id of fixtures.clients) {
      const client = await tx.client.findUnique({ where: { id } }); if (!client) continue;
      assert.ok(client.name.startsWith("Ensaio cadastro cliente "));
      assert.equal(await tx.board.count({ where: { clientId: id } }), 0); assert.equal(await tx.card.count({ where: { clientId: id } }), 0);
      await tx.client.delete({ where: { id } });
    }
  });
  console.log("Somente os cadastros temporários identificados do teste de navegador foram removidos.");
} finally { await db.$disconnect(); }
