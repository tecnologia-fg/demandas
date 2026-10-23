import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = "research/trello/local/api-capture/2026-10-22";
const output = "research/trello/local/vps/transfer";
const manifest = JSON.parse(await readFile(`${root}/reports/import-sources.json`, "utf8"));
const integrity = JSON.parse(await readFile(`${root}/reports/integrity-manifest.json`, "utf8"));
const files = [...new Set([
  ...manifest.boards.map((b) => b.file), ...manifest.files.map((f) => f.file), ...integrity.metadata.map((f) => f.file),
  "reports/import-sources.json", "reports/integrity-manifest.json", "reports/verification.json", "reports/attachments.json", "reports/counter-discrepancies.json",
])].sort();
for (const file of files) {
  assert.ok(!/[\r\n]/.test(file) && !file.startsWith("-") && !file.split("/").includes(".."));
  assert.ok(path.resolve(root, file).startsWith(path.resolve(root) + path.sep));
}
await mkdir(output, { recursive: true });
await writeFile(`${output}/capture-files.txt`, files.join("\n") + "\n");
console.log(JSON.stringify({ files: files.length, attachmentFiles: manifest.files.length, sourceBoards: manifest.boards.length }));
