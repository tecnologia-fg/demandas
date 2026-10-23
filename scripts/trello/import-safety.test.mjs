import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { stageImportFile, validateAttachmentReport } from "./import-safety.mjs";

test("report cannot change file identity, binary scope or upload policy", () => {
  const file = { boardId: "board", cardId: "card", attachmentId: "attachment", name: "report.pdf", file: "files/report.bin", bytes: 100, sha256: "a".repeat(64) };
  const manifest = { boards: [{ boardId: "board" }], attachmentBoardIds: ["board"], files: [file] };
  const row = { ...file, attachmentScope: true, policyReview: false, status: "downloaded" };
  validateAttachmentReport(manifest, [row]);
  for (const changed of [{ file: "another.bin" }, { sha256: "b".repeat(64) }, { name: "report.exe" }, { policyReview: true }, { attachmentScope: false }]) {
    assert.throws(() => validateAttachmentReport(manifest, [{ ...row, ...changed }]));
  }
  assert.throws(() => validateAttachmentReport(manifest, []), /omitted/);
  assert.throws(() => validateAttachmentReport(manifest, [row, row]), /Duplicate/);
});

test("concurrent staging shares identical binaries and preserves a conflicting existing file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dmanda-import-review-"));
  const origin = path.join(directory, "source.bin"), destination = path.join(directory, "target.pdf");
  const bytes = Buffer.from("backup content"), expected = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  try {
    await writeFile(origin, bytes);
    await Promise.all([stageImportFile(origin, destination, expected), stageImportFile(origin, destination, expected)]);
    assert.deepEqual(await readFile(destination), bytes);
    await writeFile(destination, "preexisting content");
    await assert.rejects(stageImportFile(origin, destination, expected), /existing content was preserved/);
    assert.equal(await readFile(destination, "utf8"), "preexisting content");
    await assert.rejects(stageImportFile(origin, path.join(directory, "invalid.pdf"), { ...expected, sha256: "b".repeat(64) }));
    assert.deepEqual((await readdir(directory)).sort(), ["source.bin", "target.pdf"]);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("dmanda-import-review-"));
    await rm(directory, { recursive: true, force: true });
  }
});
