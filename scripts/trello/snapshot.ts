import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseTrello, type PreviewSource } from "../../src/lib/trello/preview";
import { attachmentReportCsv } from "../../src/lib/trello/attachments";

async function main() {
const sourceDir = path.resolve(process.argv[2] ?? "research/trello/local/snapshots/2026-10-22/originals");
const snapshot = process.argv[3] ?? "2026-10-22";
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) throw new Error("Informe o nome do snapshot como AAAA-MM-DD.");
const output = path.resolve("research/trello/local/snapshots", snapshot);
const files = (await readdir(sourceDir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).map((entry) => entry.name).sort();
if (!files.length) throw new Error("Nenhum export JSON encontrado.");
const records: { filename: string; bytes: Buffer; preview: PreviewSource }[] = [];
for (const filename of files) {
  const bytes = await readFile(path.join(sourceDir, filename));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const preview = parseTrello(bytes.toString("utf8"), filename, sha256);
  const originalPath = path.join(output, "originals", filename);
  let previous: Buffer | undefined;
  try { previous = await readFile(originalPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (previous && !previous.equals(bytes)) throw new Error(`${filename}: snapshot já existe com conteúdo diferente. Preserve-o e use outro nome/data.`);
  records.push({ filename, bytes, preview });
}
if (new Set(records.map((record) => record.preview.id)).size !== records.length) throw new Error("Quadro repetido no snapshot.");
const cardIds = records.flatMap((record) => record.preview.cardIds);
if (new Set(cardIds).size !== cardIds.length) throw new Error("Card repetido entre os quadros do snapshot.");
await mkdir(path.join(output, "originals"), { recursive: true });
const existing = (await readdir(path.join(output, "originals"))).filter((name) => name.toLowerCase().endsWith(".json")).sort();
if (existing.length && (existing.length !== files.length || existing.some((name) => !files.includes(name)))) throw new Error("O snapshot contém outro conjunto de fontes. Use um snapshot separado.");
for (const record of records) {
  const target = path.join(output, "originals", record.filename);
  if (path.resolve(target) !== path.resolve(sourceDir, record.filename)) await writeFile(target, record.bytes);
  if (!(await readFile(target)).equals(record.bytes)) throw new Error(`${record.filename}: a cópia difere da fonte.`);
}
const attachments = records.flatMap((record) => record.preview.attachments);
const gaps = records.flatMap((record) => record.preview.attachmentGaps.map((gap) => ({ boardId: record.preview.id, boardName: record.preview.name, ...gap })));
const summary = {
  snapshot,
  sources: records.map(({ filename, preview }) => ({ filename, id: preview.id, name: preview.name, sha256: preview.sha256, cards: preview.totals.cards })),
  totals: { boards: records.length, cards: cardIds.length, attachments: attachments.length, attachmentBytes: attachments.reduce((sum, row) => sum + (row.bytes ?? 0), 0), missingCommentsByBadge: records.reduce((sum, record) => sum + record.preview.totals.missingComments, 0) },
  attachmentStatuses: Object.fromEntries(["pending_recovery", "policy_review", "external_link", "missing_source"].map((status) => [status, attachments.filter((row) => row.status === status).length])),
  missingAttachmentRecords: gaps.reduce((sum, gap) => sum + gap.missingCount, 0),
};
await writeFile(path.join(output, "attachment-report.json"), JSON.stringify({ summary, attachments, gaps }, null, 2) + "\n");
await writeFile(path.join(output, "attachment-report.csv"), attachmentReportCsv(attachments));
await writeFile(path.join(output, "attachments-review.csv"), attachmentReportCsv(attachments.filter((row) => ["policy_review", "missing_source"].includes(row.status))));
await writeFile(path.join(output, "manifest.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(`research/trello/snapshot-${snapshot}-summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ snapshot, ...summary.totals, statuses: summary.attachmentStatuses, missingAttachmentRecords: summary.missingAttachmentRecords }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
