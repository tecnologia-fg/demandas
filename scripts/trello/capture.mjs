import { readFile, writeFile, mkdir, rename, statfs } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { TrelloReader, CaptureError, hashFile } from "./api-client.mjs";

const root = path.resolve("research/trello/local/api-capture/2026-10-22");
const snapshotRoot = path.resolve("research/trello/local/snapshots/2026-10-22");
const workspaceName = "agenciaformulagroup";
const exportedOnly = process.argv.includes("--exported");
const metadataOnly = process.argv.includes("--metadata-only");
const api = new TrelloReader(process.env.TRELLO_API_KEY?.trim(), process.env.TRELLO_API_TOKEN?.trim());
const now = () => new Date().toISOString();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function readJson(filename, fallback) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch (error) { if (error.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}
async function jsonFile(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  await writeFile(`${filename}.tmp`, bytes); await rename(`${filename}.tmp`, filename);
  return { file: path.relative(root, filename).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha(bytes) };
}
async function fetchCached(filename, route, query = {}) {
  const cached = await readJson(filename, null);
  if (cached !== null) return cached;
  const value = await api.json(route, query); await jsonFile(filename, value); return value;
}
function unique(items, label) {
  if (!Array.isArray(items) || new Set(items.map((item) => item.id)).size !== items.length) throw new CaptureError(`INVALID_OR_DUPLICATED_${label}`);
  return items;
}
async function actionsForBoard(boardId, directory) {
  const completed = await readJson(path.join(directory, "actions.json"), null);
  if (completed) return completed;
  const actions = new Map(); let before = null, pages = 0;
  for (;;) {
    const query = { filter: "all", limit: 1000, ...(before ? { before } : {}) };
    const filename = path.join(directory, "action-pages", `${String(pages).padStart(5, "0")}.json`);
    const page = unique(await fetchCached(filename, `boards/${boardId}/actions`, query), "ACTION_PAGE");
    const previousSize = actions.size;
    for (const action of page) actions.set(action.id, action);
    pages++;
    if (page.length < 1000) break;
    if (actions.size === previousSize || page.at(-1).id === before) throw new CaptureError("ACTION_PAGINATION_NOT_ADVANCING");
    before = page.at(-1).id;
    if (pages > 10000) throw new CaptureError("ACTION_PAGE_SAFETY_LIMIT");
  }
  const result = [...actions.values()];
  await jsonFile(path.join(directory, "action-pagination.json"), { pages, count: result.length, reachedEnd: true, completedAt: now(), terminalPageSize: result.length % 1000 });
  await jsonFile(path.join(directory, "actions.json"), result);
  return result;
}
async function captureBoard(source) {
  const directory = path.join(root, "boards", source.id);
  const board = await fetchCached(path.join(directory, "board.json"), `boards/${source.id}`, { fields: "all" });
  const lists = unique(await fetchCached(path.join(directory, "lists.json"), `boards/${source.id}/lists`, { filter: "all", fields: "all" }), "LISTS");
  const cards = unique(await fetchCached(path.join(directory, "cards.json"), `boards/${source.id}/cards/all`, { fields: "all", attachments: true, attachment_fields: "all", customFieldItems: true }), "CARDS");
  const labels = unique(await fetchCached(path.join(directory, "labels.json"), `boards/${source.id}/labels`, { fields: "all", limit: 1000 }), "LABELS");
  const customFields = unique(await fetchCached(path.join(directory, "custom-fields.json"), `boards/${source.id}/customFields`), "CUSTOM_FIELDS");
  const checklists = unique(await fetchCached(path.join(directory, "checklists.json"), `boards/${source.id}/checklists`), "CHECKLISTS");
  const members = unique(await fetchCached(path.join(directory, "members.json"), `boards/${source.id}/members`, { filter: "all", fields: "id,fullName,username,avatarUrl,initials,memberType" }), "MEMBERS");
  const memberships = unique(await fetchCached(path.join(directory, "memberships.json"), `boards/${source.id}/memberships`), "MEMBERSHIPS");
  for (const card of cards) {
    if (card.idBoard !== source.id || !lists.some((list) => list.id === card.idList)) throw new CaptureError("CARD_BOARD_OR_LIST_MISMATCH");
    if (!Array.isArray(card.attachments) || (card.badges?.attachments ?? 0) > card.attachments.length) {
      card.attachments = unique(await fetchCached(path.join(directory, "card-attachments", `${card.id}.json`), `cards/${card.id}/attachments`, { fields: "all" }), "ATTACHMENTS");
    }
  }
  const boardActions = await actionsForBoard(source.id, directory);
  const combinedActions = new Map(boardActions.map((action) => [action.id, action]));
  const commentGaps = [];
  for (const card of cards) {
    const expected = card.badges?.comments ?? 0;
    const available = [...combinedActions.values()].filter((action) => action.type === "commentCard" && action.data.card?.id === card.id).length;
    if (expected <= available) continue;
    let before = null, pageIndex = 0;
    for (;;) {
      const page = unique(await fetchCached(path.join(directory, "card-comment-pages", card.id, `${pageIndex}.json`), `cards/${card.id}/actions`, { filter: "commentCard", limit: 1000, ...(before ? { before } : {}) }), "CARD_COMMENT_PAGE");
      for (const action of page) combinedActions.set(action.id, action);
      if (page.length < 1000) break;
      if (page.at(-1).id === before) throw new CaptureError("CARD_COMMENT_PAGINATION_NOT_ADVANCING");
      before = page.at(-1).id; pageIndex++;
    }
    const actual = [...combinedActions.values()].filter((action) => action.type === "commentCard" && action.data.card?.id === card.id).length;
    if (actual < expected) commentGaps.push({ cardId: card.id, expected, captured: actual, missingByBadge: expected - actual });
  }
  const actions = [...combinedActions.values()].sort((a, b) => b.id.localeCompare(a.id));
  await jsonFile(path.join(directory, "comment-gaps.json"), commentGaps);
  const originalFile = sources.sources.find((item) => item.id === source.id)?.filename;
  const original = originalFile ? await readJson(path.join(snapshotRoot, "originals", originalFile)) : null;
  // API prevalece no snapshot atual; export permanece separado e integral.
  const apiActions = new Set(actions.map((action) => action.id));
  const exportOnlyActions = (original?.actions ?? []).filter((action) => !apiActions.has(action.id));
  const bundle = { ...board, lists, cards, labels, customFields, checklists, members, memberships, actions };
  const bundleIndex = await jsonFile(path.join(directory, "board-export.json"), bundle);
  await jsonFile(path.join(directory, "comments.json"), actions.filter((action) => action.type === "commentCard"));
  await jsonFile(path.join(directory, "export-only-actions.json"), exportOnlyActions);
  const originalIds = new Set(original?.cards.map((card) => card.id) ?? []);
  const currentIds = new Set(cards.map((card) => card.id));
  const summary = { id: board.id, name: board.name, closed: board.closed,
    sourceScope: original ? "exported" : "additional", completedAt: now(),
    cards: cards.length, lists: lists.length, archivedLists: lists.filter((list) => list.closed).length,
    members: members.length, memberships: memberships.length, labels: labels.length, checklists: checklists.length,
    actions: actions.length, boardActions: boardActions.length, commentGaps: commentGaps.length, comments: actions.filter((action) => action.type === "commentCard").length,
    attachments: cards.reduce((sum, card) => sum + card.attachments.length, 0),
    addedCardIds: cards.filter((card) => !originalIds.has(card.id)).map((card) => card.id),
    absentCardIds: [...originalIds].filter((id) => !currentIds.has(id)),
    exportOnlyActions: exportOnlyActions.length, bundle: bundleIndex };
  await jsonFile(path.join(directory, "summary.json"), summary);
  console.log(JSON.stringify({ stage: "board_metadata", board: board.name, cards: summary.cards, comments: summary.comments, actions: summary.actions, attachments: summary.attachments }));
  return { bundle, summary };
}

const sources = await readJson(path.join(snapshotRoot, "manifest.json"));
const state = await readJson(path.join(root, "capture-state.json"), { startedAt: now(), boards: {}, downloads: {}, issues: [] });
async function checkpoint() { await jsonFile(path.join(root, "capture-state.json"), { ...state, updatedAt: now() }); }
async function main() {
  delete state.finishedAt;
  await api.json("members/me", { fields: "id" });
  const discovery = await fetchCached(path.join(root, "discovery.json"), "members/me/boards", { filter: "all", fields: "id,name,closed,idOrganization,url" });
  const exportedIds = new Set(sources.sources.map((source) => source.id));
  const organizations = await fetchCached(path.join(root, "organizations.json"), "members/me/organizations", { fields: "id,name,displayName" });
  const workspace = organizations.find((organization) => organization.name === workspaceName);
  if (!workspace) throw new CaptureError("WORKSPACE_NOT_FOUND");
  const workspaceBoards = unique(await fetchCached(path.join(root, "workspace-boards.json"), `organizations/${workspace.id}/boards`, { filter: "all", fields: "id,name,closed,idOrganization,url" }), "WORKSPACE_BOARDS");
  if (workspaceBoards.some((board) => board.idOrganization !== workspace.id)) throw new CaptureError("BOARD_OUTSIDE_WORKSPACE");
  const workspaceMembers = unique(await fetchCached(path.join(root, "workspace-members.json"), `organizations/${workspace.id}/members`, { fields: "id,fullName,username,avatarUrl,initials,memberType" }), "WORKSPACE_MEMBERS");
  await fetchCached(path.join(root, "workspace-memberships.json"), `organizations/${workspace.id}/memberships`);
  const selected = exportedOnly ? workspaceBoards.filter((board) => exportedIds.has(board.id)) : workspaceBoards;
  await jsonFile(path.join(root, "workspace.json"), { workspace, boards: workspaceBoards, excludedBoardCount: discovery.length - workspaceBoards.length });
  state.scope = exportedOnly ? "workspace_exported_subset" : "workspace";
  state.workspace = { id: workspace.id, name: workspace.name, displayName: workspace.displayName };
  state.attachmentBoardIds = sources.sources.map((source) => source.id);
  state.selectedBoardIds = selected.map((board) => board.id);
  const bundles = [];
  for (const source of selected) {
    try {
      const captured = await captureBoard(source);
      bundles.push(captured.bundle); state.boards[source.id] = { status: "captured", ...captured.summary };
    } catch (error) {
      const code = error instanceof CaptureError ? error.code : "CAPTURE_METADATA_FAILED";
      state.boards[source.id] = { id: source.id, name: source.name, status: "failed", code };
      console.log(JSON.stringify({ stage: "board_failed", board: source.name, code }));
    }
    await checkpoint();
  }
  const identities = new Map();
  for (const member of workspaceMembers) identities.set(member.id, { ...member, profileSource: "workspace_member" });
  for (const board of bundles) {
    for (const member of board.members) identities.set(member.id, { ...member, profileSource: "board_member" });
    for (const action of board.actions) if (action.memberCreator && !identities.has(action.memberCreator.id)) identities.set(action.memberCreator.id, { ...action.memberCreator, profileSource: "action_author" });
  }
  const referencedIds = new Set(bundles.flatMap((board) => board.cards.flatMap((card) => [...(card.idMembers ?? []), card.idMemberCreator]).filter(Boolean)));
  let missingProfiles = 0;
  for (const memberId of referencedIds) if (!identities.has(memberId)) {
    try {
      const profile = await fetchCached(path.join(root, "profiles", `${memberId}.json`), `members/${memberId}`, { fields: "id,fullName,username,avatarUrl,initials,memberType" });
      identities.set(memberId, { ...profile, profileSource: "member_lookup" });
    } catch { identities.set(memberId, { id: memberId, profileSource: "unresolved_external_identity" }); missingProfiles++; }
  }
  await jsonFile(path.join(root, "members.json"), [...identities.values()]);
  state.identityCount = identities.size; state.unresolvedIdentities = missingProfiles;
  const exportedReport = await readJson(path.join(snapshotRoot, "attachment-report.json"));
  const tasks = new Map();
  for (const board of bundles) for (const card of board.cards) for (const attachment of card.attachments) {
    tasks.set(`${card.id}:${attachment.id}`, { boardId: board.id, boardName: board.name, cardId: card.id, cardTitle: card.name, cardUrl: card.url, attachment, source: "api" });
  }
  // Conservar também anexos do export que já não apareçam na API atual.
  for (const row of exportedReport.attachments) {
    if (!selected.some((board) => board.id === row.boardId) || tasks.has(`${row.cardId}:${row.attachmentId}`)) continue;
    tasks.set(`${row.cardId}:${row.attachmentId}`, { boardId: row.boardId, boardName: row.boardName, cardId: row.cardId, cardTitle: row.cardTitle, cardUrl: row.cardUrl,
      attachment: { id: row.attachmentId, name: row.name, url: row.sourceUrl, bytes: row.bytes, isUpload: row.status !== "external_link" }, source: "export_only" });
  }
  const inventory = [...tasks.values()];
  await jsonFile(path.join(root, "attachment-inventory.json"), inventory);
  if (!metadataOnly) {
    let next = 0, completed = 0;
    async function worker() {
      while (next < inventory.length) {
        const task = inventory[next++]; const attachment = task.attachment;
        const id = `${task.cardId}:${attachment.id}`;
        if (!exportedIds.has(task.boardId)) {
          const previous = state.downloads[id];
          const priorFile = previous?.file ?? previous?.previouslyDownloadedFile;
          state.downloads[id] = { ...task, status: "metadata_only_by_scope", ...(priorFile ? { previouslyDownloadedFile: priorFile, previouslyDownloadedBytes: previous.bytes ?? previous.previouslyDownloadedBytes, previouslyDownloadedSha256: previous.sha256 ?? previous.previouslyDownloadedSha256 } : {}), reason: "User selected cards/comments only for historical boards" };
          completed++; continue;
        }
        if (!attachment.isUpload) { state.downloads[id] = { status: "external_link", ...task }; completed++; continue; }
        const previous = state.downloads[id];
        const relativePath = previous?.file ?? `files/${task.cardId}/${attachment.id}.bin`, filename = path.join(root, relativePath);
        if (previous?.status === "downloaded") {
          try { const actual = await hashFile(filename); if (actual.bytes === previous.bytes && actual.sha256 === previous.sha256) { completed++; continue; } } catch { /* re-download corrupt/missing local file */ }
        }
        try {
          const disk = await statfs(root); const available = Number(disk.bavail) * Number(disk.bsize);
          if (available < (attachment.bytes ?? 0) + 5 * 1024 ** 3) throw new CaptureError("INSUFFICIENT_DISK_SPACE");
          const result = await api.download(task.cardId, attachment, filename);
          state.downloads[id] = { ...task, status: "downloaded", ...result, file: relativePath, completedAt: now() };
        } catch (error) {
          state.downloads[id] = { ...task, status: "manual_recovery_required", code: error instanceof CaptureError ? error.code : "DOWNLOAD_FAILED", attemptedAt: now() };
        }
        completed++;
        if (completed % 20 === 0 || completed === inventory.length) {
          await checkpoint();
          console.log(JSON.stringify({ stage: "downloads", processed: completed, total: inventory.length, downloaded: Object.values(state.downloads).filter((item) => item.status === "downloaded").length, manual: Object.values(state.downloads).filter((item) => item.status === "manual_recovery_required").length }));
        }
      }
    }
    // Checkpoints são serializados para evitar colisões de rename entre workers.
    await Promise.all([worker(), worker(), worker()]);
  }
  state.finishedAt = now(); state.requestsThisRun = api.requests;
  state.additionalBoardIds = workspaceBoards.filter((board) => !exportedIds.has(board.id)).map((board) => board.id);
  await checkpoint();
  const summary = { startedAt: state.startedAt, finishedAt: state.finishedAt, scope: state.scope, workspace: state.workspace,
    selectedBoards: selected.length, capturedBoards: bundles.length, failedBoards: selected.filter((board) => state.boards[board.id]?.status !== "captured").length,
    cards: bundles.reduce((sum, board) => sum + board.cards.length, 0), comments: bundles.reduce((sum, board) => sum + board.actions.filter((action) => action.type === "commentCard").length, 0),
    identities: identities.size, unresolvedIdentities: missingProfiles, attachmentRecords: inventory.length,
    attachmentScopeBoards: sources.sources.length,
    downloaded: Object.values(state.downloads).filter((item) => exportedIds.has(item.boardId) && item.status === "downloaded").length,
    downloadedBytes: Object.values(state.downloads).filter((item) => exportedIds.has(item.boardId) && item.status === "downloaded").reduce((sum, item) => sum + item.bytes, 0),
    externalLinks: inventory.filter((task) => exportedIds.has(task.boardId) && !task.attachment.isUpload).length,
    historicalAttachmentMetadata: inventory.filter((task) => !exportedIds.has(task.boardId)).length,
    manualRecovery: Object.values(state.downloads).filter((item) => exportedIds.has(item.boardId) && item.status === "manual_recovery_required").length };
  await jsonFile(path.join(root, "summary.json"), summary);
  console.log(JSON.stringify({ stage: "capture_finished", ...summary }));
}
let checkpointQueue = Promise.resolve();
const saveCheckpoint = checkpoint;
checkpoint = () => { checkpointQueue = checkpointQueue.then(saveCheckpoint); return checkpointQueue; };
main().catch(async (error) => {
  const code = error instanceof CaptureError ? error.code : "CAPTURE_FAILED";
  state.lastError = { code, at: now() }; await checkpoint().catch(() => {});
  console.error(JSON.stringify({ stage: "capture_failed", code })); process.exitCode = 1;
});
