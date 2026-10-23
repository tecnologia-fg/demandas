import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
// This standalone read-only command also works before the Trello migration.
assert.ok(process.env.DATABASE_URL, "Load the destination environment explicitly");
const output = path.resolve(process.argv[2] ?? "research/trello/local/destination-catalog.json");
const db = new PrismaClient();
try {
  const [boards, columns, clients, users, labels, fields] = await Promise.all([
    db.board.findMany({ where: { archivedAt: null }, select: { id: true, name: true, clientId: true } }),
    db.column.findMany({ select: { id: true, boardId: true, name: true, isDone: true } }),
    db.client.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }),
    db.label.findMany({ select: { id: true, name: true, color: true } }),
    db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Column' AND column_name = 'archivedAt'`,
  ]);
  let activeIds = null;
  if (fields.length) activeIds = new Set((await db.$queryRaw`SELECT id FROM "Column" WHERE "archivedAt" IS NULL`).map((c) => c.id));
  const catalog = { boards: boards.map((b) => ({ ...b, columns: columns.filter((c) => c.boardId === b.id && (!activeIds || activeIds.has(c.id))).map(({ id, name, isDone }) => ({ id, name, isDone })) })), clients, users, labels };
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(catalog, null, 2));
  console.log(JSON.stringify({ output, boards: boards.length, clients: clients.length, users: users.length, labels: labels.length, databaseWrites: 0 }));
} catch (error) {
  // Do not dump connection strings, credentials or full Prisma diagnostics.
  const message = String(error.message);
  const reason = /Can't reach database server/i.test(message) ? "database_unreachable" : /Authentication failed/i.test(message) ? "authentication_failed" : /TLS|SSL/i.test(message) ? "tls_connection_failed" : "connection_or_schema_error";
  console.error(JSON.stringify({ status: "CATALOG_EXPORT_FAILED", code: error.code ?? error.errorCode ?? error.name, reason, databaseWrites: 0 }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
