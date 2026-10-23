import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, link, unlink } from "node:fs/promises";
import { hashFile } from "./api-client.mjs";
import { allowedExtensions } from "./workspace.mjs";

export const stableHash = (value) => createHash("sha256").update(JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest("hex");

export function validateAttachmentReport(manifest, rows) {
  const boards = new Set(manifest.boards.map((b) => b.boardId)), scope = new Set(manifest.attachmentBoardIds);
  const files = new Map(manifest.files.map((f) => [`${f.cardId}:${f.attachmentId}`, f]));
  assert.equal(files.size, manifest.files.length, "Duplicate manifest binary");
  const seen = new Set(), downloaded = new Set();
  for (const row of rows) {
    const key = `${row.cardId}:${row.attachmentId}`;
    assert.ok(!seen.has(key), "Duplicate attachment report reference"); seen.add(key);
    assert.ok(boards.has(row.boardId), "Attachment outside captured boards");
    assert.equal(row.attachmentScope, scope.has(row.boardId), "Attachment scope differs from manifest");
    if (!row.attachmentScope) { assert.equal(row.status, "metadata_only_by_scope"); continue; }
    if (row.status !== "downloaded") { assert.ok(["external_link", "manual_recovery_required"].includes(row.status), "Unknown attachment status"); continue; }
    const file = files.get(key); assert.ok(file, "Downloaded attachment absent from binary manifest");
    for (const field of ["boardId", "cardId", "attachmentId", "name", "file", "bytes", "sha256"]) assert.equal(row[field], file[field], `Attachment ${field} differs from binary manifest`);
    const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
    assert.equal(row.policyReview, file.bytes > 25 * 1024 ** 2 || !allowedExtensions.has(extension), "Attachment policy differs from actual size/format");
    downloaded.add(key);
  }
  assert.equal(downloaded.size, files.size, "Attachment report omitted manifest binaries");
}

/** Serialize registration so concurrent processes cannot use different plans for one batch. */
export async function registerImportBatch(db, { batchId, sourceHash, plan }) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
    const previous = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (previous) {
      assert.equal(previous.source, "trello", "Batch ID belongs to another operation");
      assert.equal(previous.sourceHash, sourceHash, "Batch source differs");
      assert.equal(stableHash(previous.plan), stableHash(plan), "Batch plan differs; resume with the original reviewed plan");
    } else {
      const claimed = await tx.importBatch.findFirst({ where: { source: "trello", sourceHash, id: { not: batchId } } });
      assert.ok(!claimed, "Capture already registered in another batch; resume that batch");
      await tx.importBatch.create({ data: { id: batchId, source: "trello", sourceHash, plan } });
    }
  }, { timeout: 30000, maxWait: 120000 });
}

/** A collision must never replace an attachment already present in the application. */
export async function stageImportFile(origin, destination, expected) {
  const check = async (filename) => {
    const actual = await hashFile(filename);
    assert.equal(actual.sha256, expected.sha256, "Storage file differs; existing content was preserved");
    assert.equal(actual.bytes, expected.bytes, "Storage file size differs; existing content was preserved");
  };
  try { await check(destination); return; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${destination}.${randomUUID()}.part`;
  try {
    await copyFile(origin, temporary); await check(temporary);
    try { await link(temporary, destination); }
    catch (error) { if (error.code !== "EEXIST") throw error; await check(destination); }
  } finally { await unlink(temporary).catch(() => {}); }
}
