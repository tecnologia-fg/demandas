import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { attachmentReportRow, attachmentReportCsv, safeSourceUrl, supportedAttachmentExtensions } from "../../src/lib/trello/attachments";
import { parseTrello } from "../../src/lib/trello/preview";

const context = { boardId: "b", boardName: "Quadro", cardId: "c", cardTitle: "Card", cardUrl: "https://trello.com/c/test" };
const file = { id: "a", name: "arquivo.pdf", url: "https://trello.com/file", bytes: 1, isUpload: true };
test("relatório distingue pendência de recuperação, política e link", () => {
  assert.equal(attachmentReportRow(context, file).status, "pending_recovery");
  const review = attachmentReportRow(context, { ...file, name: "foto.cr2", bytes: 26 * 1024 * 1024 });
  assert.equal(review.status, "policy_review"); assert.equal(review.reasons.length, 2);
  assert.equal(attachmentReportRow(context, { ...file, isUpload: false }).status, "external_link");
  assert.equal(attachmentReportRow(context, { ...file, url: "javascript:alert(1)" }).status, "missing_source");
  assert.equal(safeSourceUrl("https://user:password@example.com/file"), "");
});
test("CSV preserva associação por IDs, escapa texto e neutraliza fórmulas", () => {
  const row = attachmentReportRow({ ...context, cardTitle: '=HYPERLINK("https://example.com")' }, { ...file, name: 'relatório;"final".pdf' });
  const csv = attachmentReportCsv([row]);
  assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes('"ID anexo"'));
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('relatório;""final"".pdf'));
  assert.ok(csv.includes('"b";')); assert.ok(csv.includes('"a";'));
});
test("política de formatos coincide com storage atual", async () => {
  const storage = await readFile("src/server/storage.ts", "utf8");
  const body = storage.split("export const ALLOWED:")[1].split("};")[0];
  assert.deepEqual([...supportedAttachmentExtensions].sort(), [...body.matchAll(/\b([a-z0-9]+):\s*"/g)].map((match) => match[1]).sort());
});
test("snapshot de 22/10 preserva os 15 exports e identifica cada anexo", async (context) => {
  const base = "research/trello/local/snapshots/2026-10-22";
  let manifest: { sources: { filename: string; sha256: string }[] };
  try { manifest = JSON.parse(await readFile(`${base}/manifest.json`, "utf8")); }
  catch { context.skip("Snapshot privado não acompanha clone do projeto"); return; }
  const rows = [], gaps = [];
  let cards = 0;
  for (const source of manifest.sources) {
    const bytes = await readFile(`${base}/originals/${source.filename}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
    const preview = parseTrello(bytes.toString("utf8"), source.filename, source.sha256);
    cards += preview.totals.cards; rows.push(...preview.attachments); gaps.push(...preview.attachmentGaps);
    const raw = JSON.parse(bytes.toString("utf8"));
    for (const card of raw.cards) for (const attachment of card.attachments) {
      const row = preview.attachments.find((row) => row.cardId === card.id && row.attachmentId === attachment.id);
      assert.ok(row); assert.equal(row.name, attachment.fileName || attachment.name); assert.equal(row.cardTitle, card.name);
      assert.equal(row.sourceUrl, safeSourceUrl(attachment.url));
    }
  }
  assert.equal(manifest.sources.length, 15); assert.equal(cards, 1828); assert.equal(rows.length, 1558);
  assert.equal(rows.filter((row) => row.status === "policy_review").length, 32);
  assert.equal(rows.filter((row) => row.status === "pending_recovery").length, 1513);
  assert.equal(rows.filter((row) => row.status === "external_link").length, 13);
  assert.equal(gaps.reduce((sum, gap) => sum + gap.missingCount, 0), 6);
});
