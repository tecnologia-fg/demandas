import assert from "node:assert/strict";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashFile } from "./api-client.mjs";
const root = path.resolve("research/trello/local/api-capture/2026-10-22");
const output = path.resolve("research/trello/local/rehearsal/review-inputs");
const manifest = JSON.parse(await readFile(path.join(root, "reports/import-sources.json"), "utf8"));
await mkdir(output, { recursive: true });
const report = [];
for (const source of manifest.boards) {
  const filename = path.resolve(root, source.file); assert.ok(filename.startsWith(root + path.sep));
  const original = await hashFile(filename); assert.equal(original.sha256, source.sha256); assert.equal(original.bytes, source.bytes);
  const board = JSON.parse(await readFile(filename, "utf8"));
  const name = `${board.name.replace(/[^\p{L}\p{N} _-]/gu, "_").slice(0, 70)} - ${board.id}.json`;
  const destination = path.join(output, name);
  await copyFile(filename, destination);
  const actual = await hashFile(destination); assert.equal(actual.sha256, source.sha256); assert.equal(actual.bytes, source.bytes);
  report.push({ id: board.id, name: board.name, filename: name, sha256: actual.sha256 });
}
// Keep the manifest out of the selectable JSON directory.
await writeFile(path.join(output, "../review-input-manifest.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ boards: report.length, directory: output, originalsChanged: false }));
