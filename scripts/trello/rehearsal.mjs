import assert from "node:assert/strict";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { executeImport } from "./import-engine.mjs";

// The historical rehearsal keeps its original provisional plan and isolated database.
assert.equal(process.env.TRELLO_REHEARSAL, "1", "Use the rehearsal container");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "db"); assert.equal(database.pathname, "/dmanda_trello_rehearsal");
assert.equal(process.env.DIRECT_URL, process.env.DATABASE_URL);
const db = new PrismaClient();
executeImport({ db, root: path.resolve("research/trello/local/api-capture/2026-10-22"),
  output: path.resolve("research/trello/local/rehearsal"), batchId: "trello_20261022_rehearsal" })
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => { console.error(error.code ?? error.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
