import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashFile } from "./api-client.mjs";
import { allowedExtensions } from "./workspace.mjs";

// Offline audit. No API requests, credentials, application database or storage writes.
const root = path.resolve("research/trello/local/api-capture/2026-10-22");
const snapshot = path.resolve("research/trello/local/snapshots/2026-10-22");
const reports = path.join(root, "reports");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = async (name, value) => writeFile(path.join(reports, name), JSON.stringify(value, null, 2) + "\n");
const sameIds = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
const ids = (items) => items.map((item) => item.id);
function unique(items) { assert.equal(new Set(ids(items)).size, items.length); }
function localFile(relative) {
  const filename = path.resolve(root, relative);
  assert.ok(filename.startsWith(root + path.sep), "Path outside capture");
  return filename;
}
function csv(rows, keys) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["files", "reports"].includes(entry.name) || entry.name.endsWith(".tmp")) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.name.endsWith(".json")) files.push(filename);
  }
  return files;
}

const state = await read(path.join(root, "capture-state.json"));
assert.ok(state.finishedAt, "Capture must finish before audit");
assert.equal(state.workspace.name, "agenciaformulagroup");
const source = await read(path.join(snapshot, "manifest.json"));
assert.equal(source.sources.length, 15);
const binaryBoards = new Set(ids(source.sources));
sameIds(state.attachmentBoardIds, binaryBoards);
const workspaceBoards = await read(path.join(root, "workspace-boards.json"));
unique(workspaceBoards); sameIds(ids(workspaceBoards), state.selectedBoardIds);
assert.ok(workspaceBoards.every((board) => board.idOrganization === state.workspace.id));
for (const item of source.sources) {
  assert.ok(state.selectedBoardIds.includes(item.id));
  assert.equal((await hashFile(path.join(snapshot, "originals", item.filename))).sha256, item.sha256);
}

const boardRows = [], gaps = [], boardManifest = [], allAttachments = new Map();
const workspaceMembers = await read(path.join(root, "workspace-members.json"));
const members = await read(path.join(root, "members.json"));
const memberIds = new Set(ids(members));
assert.ok(workspaceMembers.every((member) => memberIds.has(member.id)));
let checklists = 0, checklistItems = 0;
for (const boardId of state.selectedBoardIds) {
  const dir = path.join(root, "boards", boardId);
  const board = await read(path.join(dir, "board-export.json"));
  const summary = await read(path.join(dir, "summary.json"));
  const actualHash = await hashFile(path.join(dir, "board-export.json"));
  assert.equal(state.boards[boardId].status, "captured");
  assert.equal(board.id, boardId); assert.equal(board.idOrganization, state.workspace.id);
  assert.equal(actualHash.sha256, summary.bundle.sha256); assert.equal(actualHash.bytes, summary.bundle.bytes);
  for (const key of ["cards", "lists", "labels", "checklists", "actions", "members", "memberships"]) unique(board[key]);
  const pagination = await read(path.join(dir, "action-pagination.json"));
  assert.equal(pagination.reachedEnd, true);
  const actionIds = new Set();
  let lastDate = null;
  for (let page = 0; page < pagination.pages; page++) {
    const actions = await read(path.join(dir, "action-pages", `${String(page).padStart(5, "0")}.json`));
    unique(actions);
    // Trello IDs are opaque: imported actions can have IDs newer than their dates.
    if (lastDate) assert.ok(actions.every((action) => Date.parse(action.date) <= lastDate));
    if (page < pagination.pages - 1) assert.equal(actions.length, 1000);
    else assert.ok(actions.length < 1000);
    for (const action of actions) { assert.ok(!actionIds.has(action.id)); actionIds.add(action.id); }
    lastDate = actions.length ? Date.parse(actions.at(-1).date) : lastDate;
  }
  assert.equal(actionIds.size, pagination.count);
  sameIds(actionIds, ids(await read(path.join(dir, "actions.json"))));
  const mergedIds = new Set(ids(board.actions));
  assert.ok([...actionIds].every((id) => mergedIds.has(id)));
  const comments = board.actions.filter((action) => action.type === "commentCard");
  sameIds(ids(comments), ids(await read(path.join(dir, "comments.json"))));
  const listIds = new Set(ids(board.lists)), labelIds = new Set(ids(board.labels)), checklistIds = new Set(ids(board.checklists));
  for (const card of board.cards) {
    assert.equal(card.idBoard, boardId); assert.ok(listIds.has(card.idList));
    assert.ok((card.idLabels ?? []).every((id) => labelIds.has(id)));
    assert.ok((card.idChecklists ?? []).every((id) => checklistIds.has(id)));
    assert.ok([...(card.idMembers ?? []), card.idMemberCreator].filter(Boolean).every((id) => memberIds.has(id)));
    unique(card.attachments);
    for (const attachment of card.attachments) allAttachments.set(`${card.id}:${attachment.id}`, boardId);
    const missingAttachments = Math.max(0, (card.badges?.attachments ?? 0) - card.attachments.length);
    const capturedComments = comments.filter((action) => action.data.card?.id === card.id).length;
    const missingComments = Math.max(0, (card.badges?.comments ?? 0) - capturedComments);
    if (missingAttachments || missingComments) gaps.push({ boardId, boardName: board.name, cardId: card.id, cardTitle: card.name, cardUrl: card.url,
      attachmentScope: binaryBoards.has(boardId), missingAttachments, missingComments,
      reason: "Contador do Trello maior que os registros retornados pela API; conteúdo não presumido nem recriado." });
    if (missingAttachments) await read(path.join(dir, "card-attachments", `${card.id}.json`));
    if (missingComments) {
      const pages = await readdir(path.join(dir, "card-comment-pages", card.id));
      const last = await read(path.join(dir, "card-comment-pages", card.id, pages.sort((a, b) => parseInt(a) - parseInt(b)).at(-1)));
      assert.ok(last.length < 1000);
    }
  }
  checklists += board.checklists.length;
  checklistItems += board.checklists.reduce((sum, list) => sum + list.checkItems.length, 0);
  boardRows.push({ boardId, boardName: board.name, archived: board.closed, attachmentScope: binaryBoards.has(boardId), cards: board.cards.length,
    comments: comments.length, actions: board.actions.length, attachments: board.cards.reduce((sum, card) => sum + card.attachments.length, 0) });
  boardManifest.push({ boardId, file: summary.bundle.file, ...actualHash, attachmentScope: binaryBoards.has(boardId) });
}

const inventory = await read(path.join(root, "attachment-inventory.json"));
assert.equal(new Set(inventory.map((task) => `${task.cardId}:${task.attachment.id}`)).size, inventory.length);
const rows = [], files = [], failures = [];
for (const task of inventory) {
  const key = `${task.cardId}:${task.attachment.id}`, item = state.downloads[key], attachment = task.attachment;
  assert.ok(state.selectedBoardIds.includes(task.boardId));
  assert.ok(item, "Inventory item missing from checkpoint"); assert.equal(item.boardId, task.boardId);
  if (task.source === "api") assert.equal(allAttachments.get(key), task.boardId);
  const inScope = binaryBoards.has(task.boardId);
  const filename = attachment.fileName || attachment.name;
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase();
  const policy = inScope && attachment.isUpload && ((attachment.bytes ?? 0) > 25 * 1024 ** 2 || !allowedExtensions.has(extension));
  const row = { boardId: task.boardId, boardName: task.boardName, cardId: task.cardId, cardTitle: task.cardTitle, cardUrl: task.cardUrl,
    attachmentId: attachment.id, name: filename, sourceUrl: attachment.url, status: item.status, file: item.file ?? "", bytes: item.bytes ?? attachment.bytes,
    sha256: item.sha256 ?? "", manualReason: item.code ?? "", policyReview: policy, attachmentScope: inScope, previouslyDownloadedFile: item.previouslyDownloadedFile ?? "" };
  if (!inScope) assert.equal(item.status, "metadata_only_by_scope");
  else if (!attachment.isUpload) assert.equal(item.status, "external_link");
  else if (item.status === "downloaded") {
    const actual = await hashFile(localFile(item.file));
    assert.equal(actual.sha256, item.sha256); assert.equal(actual.bytes, item.bytes);
    if (attachment.bytes != null) assert.equal(actual.bytes, attachment.bytes);
    files.push({ boardId: task.boardId, cardId: task.cardId, attachmentId: attachment.id, name: filename, file: item.file, ...actual });
  } else { assert.equal(item.status, "manual_recovery_required"); failures.push(row); }
  rows.push(row);
}
for (const key of allAttachments.keys()) assert.ok(state.downloads[key]);
const currentMembers = new Set(ids(workspaceMembers));
const memberRows = members.map((member) => ({ id: member.id, fullName: member.fullName, username: member.username,
  currentWorkspaceMember: currentMembers.has(member.id), source: member.profileSource }));
const summary = { verifiedAt: new Date().toISOString(), capturedAt: state.finishedAt, workspace: state.workspace.name,
  boards: boardRows.length, cards: boardRows.reduce((sum, board) => sum + board.cards, 0), comments: boardRows.reduce((sum, board) => sum + board.comments, 0),
  actions: boardRows.reduce((sum, board) => sum + board.actions, 0), checklists, checklistItems, attachmentBoards: binaryBoards.size,
  activeCards: boardRows.filter((board) => board.attachmentScope).reduce((sum, board) => sum + board.cards, 0),
  activeComments: boardRows.filter((board) => board.attachmentScope).reduce((sum, board) => sum + board.comments, 0),
  downloaded: files.length, downloadedBytes: files.reduce((sum, file) => sum + file.bytes, 0), externalLinks: rows.filter((row) => row.attachmentScope && row.status === "external_link").length,
  manualDownloads: failures.length, importPolicyReview: rows.filter((row) => row.policyReview).length,
  attachmentCounterGaps: gaps.reduce((sum, gap) => sum + gap.missingAttachments, 0), activeAttachmentCounterGaps: gaps.filter((gap) => gap.attachmentScope).reduce((sum, gap) => sum + gap.missingAttachments, 0),
  commentCounterGaps: gaps.reduce((sum, gap) => sum + gap.missingComments, 0),
  workspaceMembers: workspaceMembers.length, referencedIdentities: members.length, unresolvedIdentities: members.filter((member) => member.profileSource === "unresolved_external_identity").length,
  historicalAttachmentMetadata: rows.filter((row) => !row.attachmentScope).length,
  historicalPreviouslyDownloaded: rows.filter((row) => !row.attachmentScope && row.previouslyDownloadedFile).length };
await mkdir(reports, { recursive: true });
const columns = ["boardName", "boardId", "cardTitle", "cardId", "cardUrl", "name", "attachmentId", "status", "file", "bytes", "sha256", "manualReason", "policyReview", "attachmentScope", "sourceUrl"];
await save("attachments.json", rows);
await writeFile(path.join(reports, "attachments.csv"), csv(rows, columns));
await writeFile(path.join(reports, "manual-recovery.csv"), csv(failures, columns));
await writeFile(path.join(reports, "import-policy-review.csv"), csv(rows.filter((row) => row.policyReview), columns));
await save("counter-discrepancies.json", gaps);
await writeFile(path.join(reports, "counter-discrepancies.csv"), csv(gaps, ["boardName", "boardId", "cardTitle", "cardId", "cardUrl", "attachmentScope", "missingAttachments", "missingComments", "reason"]));
await writeFile(path.join(reports, "members.csv"), csv(memberRows, ["id", "fullName", "username", "currentWorkspaceMember", "source"]));
await save("boards.json", boardRows);
await save("import-sources.json", { workspace: state.workspace, boards: boardManifest, attachmentBoardIds: [...binaryBoards], files });
const metadata = [];
for (const filename of await walk(root)) metadata.push({ file: path.relative(root, filename).replaceAll("\\", "/"), ...await hashFile(filename) });
await save("integrity-manifest.json", { verifiedAt: summary.verifiedAt, metadata, files });
await save("verification.json", summary);
console.log(JSON.stringify(summary));
if (failures.length) process.exitCode = 2;
