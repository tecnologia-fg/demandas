import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { marked } from "marked";
import { sanitizeRich } from "../../src/lib/richtext.ts";
import { hashPassword } from "../../src/server/auth/password.ts";
import { hashFile } from "./api-client.mjs";
import { allowedExtensions } from "./workspace.mjs";
import { approvalFlowKey, resolveApprovalFlow } from "../../src/lib/trello/approval-flow.ts";
import { registerImportBatch, stageImportFile, validateAttachmentReport, stableHash } from "./import-safety.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const targetId = (kind, id) => "tr_" + hash(`${kind}:${id}`).slice(0, 32);
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
// Prisma's JSON transport rounds large fractional numbers. Keep their exact JS
// representation as strings in provenance; original source bytes remain hashed.
const json = (value) => JSON.parse(JSON.stringify(value, (_, item) => typeof item === "number" && !Number.isSafeInteger(item) ? String(item) : item));
const norm = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const ordered = (items) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
const rich = (text) => sanitizeRich(marked.parse(text ?? "", { async: false, breaks: true }));
const date = (value) => { if (!value) return null; const d = new Date(value); assert.ok(Number.isFinite(d.getTime()), "Invalid date"); return d; };
const idDate = (id) => new Date(parseInt(id.slice(0, 8), 16) * 1000);
const colors = { green: "#4bce97", yellow: "#f5cd47", orange: "#fea362", red: "#f87168", purple: "#9f8fef", blue: "#579dff", sky: "#6cc3e0", lime: "#94c748", pink: "#e774bb", black: "#8590a2" };
const color = (value) => value?.startsWith("#") ? value : colors[value?.split("_")[0]] ?? "#64748b";
const makeEntity = (batchId, kind, externalId, original, target = null, status = "IMPORTED") => ({ id: targetId(`entity:${kind}`, externalId), batchId, kind, externalId, original: json(original), targetId: target, status });
const failBoard = process.argv.find((arg) => arg.startsWith("--fail-board="))?.split("=")[1];
if (failBoard) assert.equal(process.env.TRELLO_REHEARSAL, "1", "Failure injection is restricted to rehearsals");

export async function executeImport({ db, root, output, batchId, reviewed = null, decisions = null, storage = "storage", dryRun = false }) {
  const entity = (...args) => makeEntity(batchId, ...args);
  const manifestBytes = await readFile(path.join(root, "reports/import-sources.json"));
  const manifest = JSON.parse(manifestBytes);
  const verified = await read(path.join(root, "reports/verification.json"));
  assert.equal(manifest.workspace.name, "agenciaformulagroup"); assert.equal(manifest.boards.length, 33);
  assert.equal(manifest.attachmentBoardIds.length, 15);
  const binaryBoards = new Set(manifest.attachmentBoardIds);
  const attachments = await read(path.join(root, "reports/attachments.json"));
  validateAttachmentReport(manifest, attachments);
  const profiles = await read(path.join(root, "members.json"));
  const integrity = await read(path.join(root, "reports/integrity-manifest.json"));
  const memberProof = integrity.metadata.find((item) => item.file === "members.json"); assert.ok(memberProof, "Missing identity integrity proof");
  const memberHash = await hashFile(path.join(root, "members.json")); assert.equal(memberHash.sha256, memberProof.sha256); assert.equal(memberHash.bytes, memberProof.bytes);
  const stateProof = integrity.metadata.find((item) => item.file === "capture-state.json"); assert.ok(stateProof, "Missing capture integrity proof");
  const stateHash = await hashFile(path.join(root, "capture-state.json")); assert.equal(stateHash.sha256, stateProof.sha256); assert.equal(stateHash.bytes, stateProof.bytes);
  assert.equal(verified.capturedAt, (await read(path.join(root, "capture-state.json"))).finishedAt, "Capture date differs from audited source");
  const gaps = await read(path.join(root, "reports/counter-discrepancies.json"));
  if (decisions) {
    assert.equal(attachments.filter((a) => a.attachmentScope && a.policyReview).length, decisions.policyFiles.count);
    assert.equal(gaps.filter((g) => g.attachmentScope).reduce((n, g) => n + g.missingAttachments, 0), decisions.missingContent.activeAttachmentReferences);
    assert.equal(gaps.reduce((n, g) => n + g.missingComments, 0), decisions.missingContent.comments);
  }
  const identity = new Map(profiles.map((member) => [member.id, member]));
  const plan = reviewed ?? { kind: "dmanda-trello-docker-rehearsal", version: 1, provisional: true, workspace: manifest.workspace.name,
    completion: "preserve", people: "external_identity", clients: [{ key: "spmar", name: "SPMAR", boardIds: ["69c6c052fd24c610bedb958a", "69cc2095780821c0524d235c"] }], attachments: "compatible_only", attachmentBoardIds: manifest.attachmentBoardIds,
    boards: manifest.boards.map((board) => ({ id: board.boardId, sha256: board.sha256, targetId: targetId("board", board.boardId) })) };
  const sourceHash = hash(manifestBytes), planHash = hash(stable(plan));
  const previous = await db.importBatch.findUnique({ where: { id: batchId } });
  if (previous) {
    assert.equal(previous.sourceHash, sourceHash);
    if (hash(stable(previous.plan)) !== planHash && process.argv.includes("--revise-clients")) {
      assert.equal(previous.plan.clients, "unassigned");
      assert.equal(hash(stable({ ...previous.plan, clients: plan.clients })), planHash);
      for (const client of plan.clients) for (const boardId of client.boardIds) {
        assert.equal(await db.importedEntity.count({ where: { batchId, kind: "board", externalId: boardId } }), 0, "Client revision can only affect boards not yet imported");
      }
      await writeFile(path.join(output, "plan-before-client-revision.json"), JSON.stringify(previous.plan, null, 2));
      await db.importBatch.update({ where: { id: batchId }, data: { plan } });
    } else assert.equal(hash(stable(previous.plan)), planHash);
  }
  const duplicate = await db.importedEntity.findFirst({ where: { kind: "board", externalId: { in: manifest.boards.map((b) => b.boardId) }, batchId: { not: batchId }, batch: { source: "trello" } } });
  assert.ok(!duplicate, "Source board already imported by another batch; use that batch, never duplicate it");
  const boards = [];
  // Verify every source before the first business write; never trust a directory glob.
  for (const source of manifest.boards) {
    const filename = path.resolve(root, source.file); assert.ok(filename.startsWith(root + path.sep));
    const actual = await hashFile(filename); assert.equal(actual.sha256, source.sha256); assert.equal(actual.bytes, source.bytes);
    const board = await read(filename); assert.equal(board.idOrganization, manifest.workspace.id);
    boards.push(board);
  }
  const expectedGaps = boards.flatMap((board) => {
    const comments = new Map();
    for (const action of board.actions) if (action.type === "commentCard") comments.set(action.data.card.id, (comments.get(action.data.card.id) ?? 0) + 1);
    return board.cards.map((card) => ({ boardId: board.id, cardId: card.id, attachmentScope: binaryBoards.has(board.id),
      missingAttachments: Math.max(0, (card.badges?.attachments ?? 0) - card.attachments.length), missingComments: Math.max(0, (card.badges?.comments ?? 0) - (comments.get(card.id) ?? 0))
    })).filter((gap) => gap.missingAttachments || gap.missingComments);
  });
  const gapValues = (items) => items.map(({ boardId, cardId, attachmentScope, missingAttachments, missingComments }) => ({ boardId, cardId, attachmentScope, missingAttachments, missingComments })).sort((a, b) => a.cardId.localeCompare(b.cardId));
  assert.deepEqual(gapValues(gaps), gapValues(expectedGaps), "Missing-content report differs from source cards");
  for (const file of manifest.files) {
    assert.ok(binaryBoards.has(file.boardId));
    const filename = path.resolve(root, file.file); assert.ok(filename.startsWith(root + path.sep));
    const actual = await hashFile(filename); assert.equal(actual.sha256, file.sha256); assert.equal(actual.bytes, file.bytes);
  }
  if (dryRun) return { sourceHash, planHash, boards: boards.length, files: manifest.files.length, status: "PREFLIGHT_PASSED" };
  await mkdir(output, { recursive: true }); await mkdir(storage, { recursive: true });
  await writeFile(path.join(output, "plan.json"), JSON.stringify(plan, null, 2));
  await registerImportBatch(db, { batchId, sourceHash, plan });
  if (decisions) await db.importedEntity.createMany({ data: [entity("content-decision", manifest.workspace.id, decisions, null, "USER_DECISION_RECORDED"),
    ...gaps.map((gap) => entity("content-gap", gap.cardId, { ...gap, recovered: false,
      decision: gap.attachmentScope || gap.missingComments ? "accept_and_record" : "metadata_only_by_scope" }, null,
    gap.attachmentScope || gap.missingComments ? "ACCEPTED_ABSENCE" : "OUT_OF_BINARY_SCOPE"))], skipDuplicates: true });
  if (!reviewed) {
  await db.appSetting.upsert({ where: { key: "trelloRehearsal" }, create: { key: "trelloRehearsal", value: batchId }, update: {} });
  await db.appSetting.upsert({ where: { key: "setupCompletedAt" }, create: { key: "setupCompletedAt", value: new Date().toISOString() }, update: {} });
  assert.ok(process.env.REHEARSAL_ADMIN_PASSWORD?.length >= 16);
  await db.user.upsert({ where: { email: process.env.REHEARSAL_ADMIN_EMAIL }, create: { id: "rehearsal_admin", name: "Administrador do ensaio", email: process.env.REHEARSAL_ADMIN_EMAIL,
    passwordHash: hashPassword(process.env.REHEARSAL_ADMIN_PASSWORD), role: "ADMIN" }, update: {} });
  }
  await db.importedEntity.createMany({ data: profiles.map((profile) => entity("identity", profile.id, profile, null, "EXTERNAL_IDENTITY")), skipDuplicates: true });
  const pilotNames = ["Magik", "CEVISA", "Rivellino", "Master Med", "Liquitudo", "Deputada Leci Brandão"];
  const selected = process.argv.includes("--pilot") ? boards.filter((board) => pilotNames.includes(board.name)) : boards;
  const report = [];
  // A dedicated PostgreSQL advisory lock prevents two executions allocating card numbers concurrently.
  for (const board of selected) {
    const existing = await db.importedEntity.findUnique({ where: { batchId_kind_externalId: { batchId, kind: "board", externalId: board.id } } });
    if (existing) {
      if (process.argv.includes("--repair-source-json")) {
        const records = await db.importedEntity.findMany({ where: { batchId } });
        for (const record of records) {
          let original = null;
          if (record.kind === "board" && record.externalId === board.id) original = board;
          if (record.kind === "card") { const card = board.cards.find((item) => item.id === record.externalId); if (card) original = { ...record.original, ...card }; }
          if (record.kind === "column") original = board.lists.find((item) => item.id === record.externalId);
          if (record.kind === "comment") original = board.actions.find((item) => item.id === record.externalId);
          if (record.kind === "checklist") original = board.checklists.find((item) => item.id === record.externalId);
          if (original) await db.importedEntity.update({ where: { id: record.id }, data: { original: json(original) } });
        }
      }
      report.push({ boardId: board.id, status: "already_imported" }); continue;
    }
    const boardAttachments = attachments.filter((item) => item.boardId === board.id);
    const localFiles = [];
    for (const item of boardAttachments.filter((item) => item.attachmentScope && item.status === "downloaded" && !item.policyReview)) {
      assert.ok(binaryBoards.has(board.id));
      const extension = /\.([a-z0-9]+)$/i.exec(item.name)?.[1].toLowerCase(); assert.ok(allowedExtensions.has(extension));
      assert.ok(item.bytes <= 25 * 1024 ** 2);
      const storedName = `${targetId("attachment", item.attachmentId)}.${extension}`, destination = path.resolve(storage, storedName);
      const origin = path.resolve(root, item.file); assert.ok(origin.startsWith(root + path.sep));
      await stageImportFile(origin, destination, item);
      localFiles.push({ ...item, storedName });
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(22102026)`;
      const registered = await tx.importBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(registered.sourceHash, sourceHash); assert.equal(stableHash(registered.plan), planHash, "Registered batch plan changed");
      const choice = reviewed?.boards.find((item) => item.sourceBoardId === board.id);
      if (choice) {
        const users = [...new Set(Object.values(choice.people).filter(Boolean))];
        assert.equal(await tx.user.count({ where: { id: { in: users }, active: true } }), users.length, "A mapped account is now unavailable");
        if (choice.clientId) await tx.client.findFirstOrThrow({ where: { id: choice.clientId, active: true } });
      }
      if (await tx.importedEntity.findUnique({ where: { batchId_kind_externalId: { batchId, kind: "board", externalId: board.id } } })) return;
      const boardId = choice?.targetBoardId || targetId("board", board.id), capturedAt = date(verified.capturedAt);
      const clientChoice = !reviewed && plan.clients.find((client) => client.boardIds.includes(board.id));
      const clientId = choice ? choice.clientId || null : clientChoice ? targetId("client", clientChoice.key) : null;
      if (clientChoice) {
        await tx.client.upsert({ where: { id: clientId }, create: { id: clientId, name: clientChoice.name }, update: {} });
        await tx.importedEntity.upsert({ where: { batchId_kind_externalId: { batchId, kind: "client", externalId: clientChoice.key } }, create: entity("client", clientChoice.key, clientChoice, clientId), update: {} });
      }
      if (!choice?.targetBoardId) await tx.board.create({ data: { id: boardId, name: choice?.name ?? board.name, description: rich(board.desc) || null, color: color(board.prefs?.backgroundColor),
        clientId, archivedAt: board.closed ? date(board.dateClosed) ?? capturedAt : null, position: boards.indexOf(board), createdAt: idDate(board.id) } });
      else {
        const destination = await tx.board.findUniqueOrThrow({ where: { id: boardId } });
        assert.equal(destination.clientId, clientId, "Existing board client changed since preflight");
        assert.equal(destination.archivedAt, null, "Existing board is now archived");
      }
      const lists = ordered(board.lists), columnMap = new Map(), columns = [];
      const lastColumn = await tx.column.aggregate({ where: { boardId }, _max: { position: true } });
      let columnPosition = (lastColumn._max.position ?? -1) + 1;
      for (const list of lists) {
        const mapping = choice?.lists.find((item) => item.sourceListId === list.id);
        if (mapping?.mode === "omit") continue;
        const columnId = mapping?.mode === "existing" ? mapping.targetColumnId : targetId("column", list.id);
        columnMap.set(list.id, columnId);
        if (mapping?.mode === "existing") {
          const existingColumn = await tx.column.findFirstOrThrow({ where: { id: columnId, boardId, archivedAt: null } });
          assert.equal(existingColumn.isDone, mapping.isDone, "Destination column completion changed");
        } else columns.push({ id: columnId, boardId, name: mapping?.name ?? (norm(list.name) === "planejamento" ? "Caixa de entrada" : list.name),
          position: columnPosition++, isDone: mapping?.isDone ?? norm(list.name) === "concluido", archivedAt: list.closed ? capturedAt : null });
      }
      if (columns.length) await tx.column.createMany({ data: columns });
      const extraColumns = reviewed?.extraApprovalColumns?.[board.id] ?? [];
      for (const extra of extraColumns) {
        const { key, ...data } = extra;
        assert.ok(!await tx.column.findUnique({ where: { id: extra.id } }), "Additional approval column ID is already in use");
        await tx.column.create({ data: { ...data, boardId, position: columnPosition++ } });
        await tx.importedEntity.create({ data: entity("approval-column", `${board.id}:${key}`, { key, name: extra.name, isDone: extra.isDone, sourceBoardId: board.id }, extra.id, "CREATED_BY_FLOW_REVIEW") });
      }
      const labelMap = new Map();
      for (const label of board.labels) {
        // Reuse only exact name/color matches across boards. Nameless labels stay distinct.
        const mapped = choice?.labels[label.id];
        if (mapped === "__ignore__") { labelMap.set(label.id, null); continue; }
        if (mapped) { await tx.label.findUniqueOrThrow({ where: { id: mapped } }); labelMap.set(label.id, mapped); continue; }
        const key = label.name ? `${norm(label.name)}:${label.color}` : label.id;
        const labelId = targetId("label", key); labelMap.set(label.id, labelId);
        await tx.label.upsert({ where: { id: labelId }, create: { id: labelId, name: label.name || `Sem nome (${label.id.slice(-6)})`, color: color(label.color) }, update: {} });
      }
      const cards = lists.flatMap((list) => ordered(board.cards.filter((card) => card.idList === list.id)));
      assert.equal(cards.length, board.cards.length);
      const max = await tx.card.aggregate({ _max: { number: true } }); let number = max._max.number ?? 0;
      const records = [], cardData = [];
      const positions = new Map();
      for (const columnId of new Set(columnMap.values())) {
        const last = await tx.card.aggregate({ where: { columnId }, _max: { position: true } });
        positions.set(columnId, (last._max.position ?? -1) + 1);
      }
      for (const card of cards) {
        const id = targetId("card", card.id);
        const fields = (card.customFieldItems ?? []).map((item) => {
          const definition = board.customFields.find((field) => field.id === item.idCustomField);
          const option = definition?.options?.find((option) => option.id === item.idValue);
          return { name: definition?.name ?? item.idCustomField, value: option?.value?.text ?? item.value ?? null };
        });
        const priorityValue = fields.find((field) => norm(field.name) === "prioridade")?.value;
        const priority = { Normal: "MEDIUM", Alta: "HIGH", Urgente: "URGENT" }[priorityValue] ?? null;
        const createAction = board.actions.find((action) => action.type === "createCard" && action.data.card?.id === card.id);
        const columnId = columnMap.get(card.idList), cardPosition = positions.get(columnId);
        assert.ok(columnId); positions.set(columnId, cardPosition + 1);
        const completed = choice?.completion === "column" ? choice.lists.find((item) => item.sourceListId === card.idList).isDone : card.dueComplete;
        cardData.push({ id, number: ++number, boardId, clientId, columnId, title: card.name, description: rich(card.desc) || null,
          createdById: choice?.people[createAction?.idMemberCreator ?? card.idMemberCreator] || null,
          priority, startDate: date(card.start), dueDate: date(card.due), completedAt: completed ? date(card.dateCompleted) ?? capturedAt : null,
          archivedAt: card.closed ? date(card.dateClosed) ?? capturedAt : null, isTemplate: Boolean(card.isTemplate), position: cardPosition,
          createdAt: date(createAction?.date) ?? idDate(card.id), updatedAt: date(card.dateLastActivity) ?? capturedAt,
          coverColor: card.cover?.color ? color(card.cover.color) : null });
        records.push(entity("card", card.id, { ...card, resolvedFields: fields, sourceListName: board.lists.find((list) => list.id === card.idList)?.name,
          missingContent: gaps.find((gap) => gap.cardId === card.id) ?? null,
          externalAssignees: (card.idMembers ?? []).map((memberId) => ({ id: memberId, name: identity.get(memberId)?.fullName ?? identity.get(memberId)?.username ?? memberId })),
          creationDateSource: createAction ? "createCard_action" : "estimated_from_id", completionDateSource: card.dateCompleted ? "trello" : card.dueComplete ? "capture_fallback" : null,
          archiveDateSource: card.dateClosed ? "trello" : card.closed ? "capture_fallback" : null }, id));
      }
      await tx.card.createMany({ data: cardData });
      if (failBoard === board.id) throw new Error("REHEARSAL_INJECTED_FAILURE");
      const assignees = choice ? cards.flatMap((card) => [...new Set((card.idMembers ?? []).map((id) => choice.people[id]).filter(Boolean))].map((userId) => ({ cardId: targetId("card", card.id), userId }))) : [];
      if (assignees.length) await tx.cardAssignee.createMany({ data: assignees, skipDuplicates: true });
      const cardLabels = cards.flatMap((card) => (card.idLabels ?? []).map((labelId) => labelMap.get(labelId)).filter(Boolean).map((labelId) => ({ cardId: targetId("card", card.id), labelId })));
      if (cardLabels.length) await tx.cardLabel.createMany({ data: cardLabels, skipDuplicates: true });
      if (board.checklists.length) await tx.checklist.createMany({ data: ordered(board.checklists).map((list, index) => ({ id: targetId("checklist", list.id), cardId: targetId("card", list.idCard), title: list.name, position: index })) });
      const items = board.checklists.flatMap((list) => ordered(list.checkItems).map((item, index) => ({ id: targetId("checkitem", item.id), checklistId: targetId("checklist", list.id), text: item.name, done: item.state === "complete", position: index })));
      if (items.length) await tx.checklistItem.createMany({ data: items });
      const comments = board.actions.filter((action) => action.type === "commentCard");
      if (comments.length) await tx.comment.createMany({ data: comments.map((action) => ({ id: targetId("comment", action.id), cardId: targetId("card", action.data.card.id),
        userId: choice?.people[action.idMemberCreator ?? action.memberCreator?.id] || null,
        body: rich(action.data.text), createdAt: date(action.date), externalAuthorId: action.idMemberCreator ?? action.memberCreator?.id,
        externalAuthorName: action.memberCreator?.fullName ?? identity.get(action.idMemberCreator)?.fullName ?? action.memberCreator?.username ?? "Autor desconhecido" })) });
      const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav" };
      if (localFiles.length) await tx.attachment.createMany({ data: localFiles.map((file) => ({ id: targetId("attachment", file.attachmentId), cardId: targetId("card", file.cardId), name: file.name,
        storedName: file.storedName, mime: mime[file.storedName.split(".").at(-1)] ?? "application/octet-stream", size: file.bytes,
        createdAt: date(board.cards.find((card) => card.id === file.cardId)?.attachments.find((attachment) => attachment.id === file.attachmentId)?.date) ?? capturedAt })) });
      for (const card of cards) if (card.idAttachmentCover && localFiles.some((file) => file.attachmentId === card.idAttachmentCover)) {
        await tx.card.update({ where: { id: targetId("card", card.id) }, data: { coverAttachmentId: targetId("attachment", card.idAttachmentCover), updatedAt: date(card.dateLastActivity) ?? capturedAt } });
      }
      records.push(entity("board", board.id, board, boardId), ...lists.map((list) => entity("column", list.id, list, columnMap.get(list.id) ?? null, columnMap.has(list.id) ? "IMPORTED" : "OMITTED_EMPTY")),
        ...board.labels.map((label) => entity("label", label.id, label, labelMap.get(label.id), labelMap.get(label.id) ? "IMPORTED" : "IGNORED_BY_REVIEW")),
        ...comments.map((action) => entity("comment", action.id, action, targetId("comment", action.id))),
        ...board.checklists.map((list) => entity("checklist", list.id, list, targetId("checklist", list.id))),
        ...boardAttachments.map((file) => entity("attachment", `${file.cardId}:${file.attachmentId}`, file,
          localFiles.some((local) => local.attachmentId === file.attachmentId) ? targetId("attachment", file.attachmentId) : null,
          !file.attachmentScope ? "METADATA_ONLY_BY_SCOPE" : file.policyReview ? decisions ? "BACKUP_ONLY_UNTIL_REVIEW" : "POLICY_REVIEW" : file.status === "external_link" ? "EXTERNAL_LINK" : file.status === "downloaded" ? "IMPORTED" : "MANUAL_RECOVERY")));
      await tx.importedEntity.createMany({ data: records });
      const flow = reviewed?.approvalFlows?.[board.id];
      if (flow) {
        resolveApprovalFlow(flow, await tx.column.findMany({ where: { boardId, archivedAt: null } }));
        const key = approvalFlowKey(boardId), value = JSON.stringify(flow);
        const previousFlow = await tx.appSetting.findUnique({ where: { key } });
        assert.ok(!previousFlow || previousFlow.value === value, "Existing approval flow differs; review explicitly before importing");
        await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
      }
    }, { timeout: 120000, maxWait: 120000 });
    report.push({ boardId: board.id, name: board.name, status: "imported", cards: board.cards.length, files: localFiles.length });
    console.log(JSON.stringify(report.at(-1)));
  }
  const count = await db.importedEntity.count({ where: { batchId, kind: "board" } });
  if (count === boards.length) await db.importBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", finishedAt: new Date() } });
  await writeFile(path.join(output, "last-run.json"), JSON.stringify({ finishedAt: new Date().toISOString(), sourceHash, planHash, completedBoards: count, selected: report }, null, 2));
  return { stage: "rehearsal_finished", completedBoards: count, importedThisRun: report.filter((item) => item.status === "imported").length };
}
