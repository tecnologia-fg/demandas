import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogBoard } from './catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, 'research/trello/local/workspace');
export const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
const sorted = (items) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
const sum = (items, get) => items.reduce((total, item) => total + get(item), 0);
const counts = (items, key) => {
  const out = {};
  for (const item of items) { const value = key(item) ?? '(vazio)'; out[value] = (out[value] ?? 0) + 1; }
  return out;
};
export const allowedExtensions = new Set('jpg jpeg png webp gif heic pdf doc docx xls xlsx ppt pptx txt csv zip mp4 mov mp3 wav psd ai fig'.split(' '));
const doneCandidate = (name) => ['concluido', 'aprovado - concluido'].includes(normalize(name));

async function jsonFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await jsonFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(relative);
  }
  return files.sort();
}

export function analyzeWorkspace(records) {
  const boards = records.map((record) => record.board);
  if (new Set(boards.map((board) => board.id)).size !== boards.length) throw new Error('Quadro duplicado: escolher explicitamente o snapshot antes de analisar');
  const findings = [];
  const listRows = [], attachmentRows = [], fieldRows = [], memberRows = [], labelRows = [], cardRows = [];
  const byBoard = boards.map((board) => {
    const lists = new Map(board.lists.map((list) => [list.id, list]));
    const members = new Map(board.members.map((member) => [member.id, member]));
    const cards = new Map(board.cards.map((card) => [card.id, card]));
    const fields = new Map(board.customFields.map((field) => [field.id, field]));
    const comments = board.actions.filter((action) => action.type === 'commentCard');
    const add = (code, entityId, detail = null) => findings.push({ boardId: board.id, code, entityId, detail });
    const closedLists = board.lists.filter((list) => list.closed);
    let commentGap = 0, completedOutsideFinal = 0, incompleteInFinal = 0;
    for (const member of board.members) memberRows.push({ board: board.name, ...member });
    for (const label of board.labels) labelRows.push({ board: board.name, ...label });
    for (const list of sorted(board.lists)) {
      listRows.push({ board: board.name, id: list.id, name: list.name, normalized: normalize(list.name), closed: list.closed,
        cards: board.cards.filter((card) => card.idList === list.id).length });
    }
    for (const field of board.customFields) fieldRows.push({ board: board.name, ...field });
    for (const card of board.cards) {
      cardRows.push({ board: board.name, ...card });
      const cardComments = comments.filter((action) => action.data.card?.id === card.id);
      const gap = Math.max(0, (card.badges?.comments ?? 0) - cardComments.length);
      commentGap += gap;
      if (gap) add('missing_comments', card.id, gap);
      if (card.dueComplete && !doneCandidate(lists.get(card.idList).name)) completedOutsideFinal++;
      if (!card.dueComplete && doneCandidate(lists.get(card.idList).name)) incompleteInFinal++;
      if (lists.get(card.idList).closed) add('card_in_archived_list', card.id);
      if (card.isTemplate) add('template_card', card.id);
      if (!card.due && /^\d{1,2}[\/-]\d{1,2}/.test(card.name)) add('date_title_without_due', card.id);
      for (const memberId of card.idMembers ?? []) if (!members.has(memberId)) add('assignee_not_in_board_members', card.id, memberId);
      if (card.idMemberCreator && !members.has(card.idMemberCreator)) add('creator_not_in_board_members', card.id, card.idMemberCreator);
      if (card.idAttachmentCover && !card.attachments.some((item) => item.id === card.idAttachmentCover)) add('missing_cover_attachment', card.id);
      if ((card.badges?.attachments ?? 0) !== card.attachments.length) add('attachment_badge_mismatch', card.id);
      if (card.start && card.due && Date.parse(card.start) > Date.parse(card.due)) add('start_after_due', card.id);
      for (const key of ['start', 'due', 'dateClosed', 'dateCompleted', 'dateLastActivity']) {
        if (card[key] && !Number.isFinite(Date.parse(card[key]))) add('invalid_date', card.id, key);
      }
      if (card.name.length > 200) add('title_over_200', card.id, card.name.length);
      if ((card.desc?.length ?? 0) > 60000) add('description_over_60000', card.id, card.desc.length);
      for (const item of card.customFieldItems ?? []) {
        const field = fields.get(item.idCustomField);
        if (!field || (item.idValue && !field.options?.some((option) => option.id === item.idValue))) add('unknown_custom_field_or_option', card.id, item.idCustomField);
        if (field?.name === 'Pasta do Drive' && item.value?.text && !/^https?:\/\//i.test(item.value.text)) add('drive_path_without_url', card.id);
      }
      for (const attachment of card.attachments) {
        const ext = path.extname(attachment.fileName ?? attachment.name).slice(1).toLowerCase();
        let host = null;
        try { host = new URL(attachment.url).hostname; } catch { add('invalid_attachment_url', attachment.id); }
        const reasons = [];
        if (attachment.bytes > 25 * 1024 * 1024) reasons.push('over_25_mib');
        if (attachment.isUpload && !allowedExtensions.has(ext)) reasons.push('unsupported_extension');
        if (!attachment.isUpload) reasons.push('external_link');
        attachmentRows.push({ board: board.name, cardId: card.id, ...attachment, ext, host, reasons });
        for (const reason of reasons) add(reason, attachment.id);
      }
    }
    for (const comment of comments) {
      if (!cards.has(comment.data.card?.id)) add('comment_for_absent_card', comment.id);
      if (!members.has(comment.idMemberCreator)) add('comment_author_not_in_board_members', comment.id, comment.idMemberCreator);
    }
    for (const check of board.checklists) {
      if (!cards.has(check.idCard)) add('orphan_checklist', check.id);
      else if (!cards.get(check.idCard).idChecklists.includes(check.id)) add('unreferenced_checklist', check.id);
      for (const item of check.checkItems) {
        if (item.due || item.idMember) add('advanced_checklist_item', item.id);
      }
    }
    const orderedActive = sorted(board.lists.filter((list) => !list.closed));
    const approvalIndex = orderedActive.findIndex((list) => normalize(list.name).includes('aprova') && !doneCandidate(list.name));
    return { name: board.name, sourceId: board.id, cards: board.cards.length,
      archivedCards: board.cards.filter((card) => card.closed).length,
      templates: board.cards.filter((card) => card.isTemplate).length,
      openLists: board.lists.length - closedLists.length, archivedLists: closedLists.length,
      cardsInArchivedLists: board.cards.filter((card) => lists.get(card.idList).closed).length,
      attachments: sum(board.cards, (card) => card.attachments.length),
      exportedComments: comments.length, missingCommentsByBadge: commentGap,
      actions: board.actions.length, atActionCap: board.actions.length === 1000,
      completedOutsideFinal, incompleteInFinal,
      currentApprovalSelectedActiveList: approvalIndex < 0 ? null : orderedActive[approvalIndex].name,
      currentApprovalNextActiveList: approvalIndex < 0 ? null : orderedActive[approvalIndex + 1]?.name ?? null,
      finalCandidates: board.lists.filter((list) => doneCandidate(list.name)).map((list) => list.name),
      findings: counts(findings.filter((finding) => finding.boardId === board.id), (finding) => finding.code),
    };
  });
  const groups = (rows, key, project) => {
    const grouped = new Map();
    for (const row of rows) { const k = key(row); if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(row); }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ key, ...project(values) }));
  };
  const distinctCards = new Set(cardRows.map((card) => card.id));
  const duplicateCardIds = groups(cardRows, (card) => card.id, (rows) => ({ occurrences: rows.length, boards: rows.map((row) => row.board) })).filter((row) => row.occurrences > 1);
  const listPatterns = groups(listRows, (list) => list.normalized, (rows) => ({
    variants: [...new Set(rows.map((row) => row.name))].sort(), boards: [...new Set(rows.map((row) => row.board))].sort(),
    instances: rows.length, archivedInstances: rows.filter((row) => row.closed).length, cards: sum(rows, (row) => row.cards),
  }));
  const labelPatterns = groups(labelRows, (label) => normalize(label.name), (rows) => ({
    names: [...new Set(rows.map((row) => row.name))].sort(), colors: [...new Set(rows.map((row) => row.color))].sort(),
    boards: [...new Set(rows.map((row) => row.board))].sort(), definitions: rows.length,
    cardLinks: sum(rows, (label) => cardRows.filter((card) => card.board === label.board && card.idLabels.includes(label.id)).length),
  }));
  const fieldPatterns = groups(fieldRows, (field) => normalize(field.name), (rows) => ({
    names: [...new Set(rows.map((row) => row.name))], types: [...new Set(rows.map((row) => row.type))], boards: rows.length,
    optionVariants: [...new Set(rows.flatMap((field) => field.options?.map((option) => option.value.text) ?? []))].sort(),
    populatedCards: cardRows.filter((card) => card.customFieldItems.some((item) => rows.some((field) => field.id === item.idCustomField))).length,
    values: counts(cardRows.flatMap((card) => card.customFieldItems.flatMap((item) => {
      const field = rows.find((field) => field.id === item.idCustomField);
      return field ? [field.type === 'list' ? field.options?.find((option) => option.id === item.idValue)?.value.text ?? '(opção desconhecida)' : '(preenchido)'] : [];
    })), (value) => value),
  }));
  const identityRows = groups(memberRows, (member) => member.id, (rows) => ({
    names: [...new Set(rows.map((row) => row.fullName))], usernames: [...new Set(rows.map((row) => row.username))], boards: rows.map((row) => row.board),
  }));
  const duplicateTitles = groups(cardRows, (card) => normalize(card.name), (rows) => ({
    occurrences: rows.length, cards: rows.map((row) => ({ board: row.board, cardId: row.id, isTemplate: row.isTemplate })),
  })).filter((row) => row.occurrences > 1);
  const memberIds = new Set(memberRows.map((member) => member.id));
  const actionAuthorIds = new Set(boards.flatMap((board) => board.actions.map((action) => action.idMemberCreator).filter(Boolean)));
  const knownIdentityIds = new Set([...memberIds, ...actionAuthorIds]);
  const creatorIds = new Set(cardRows.map((card) => card.idMemberCreator).filter(Boolean));
  const totals = {
    boards: boards.length, cards: cardRows.length, distinctCardIds: distinctCards.size,
    sourceBytes: sum(records, (record) => record.bytes.length),
    openLists: sum(byBoard, (board) => board.openLists), archivedLists: sum(byBoard, (board) => board.archivedLists),
    cardsInArchivedLists: sum(byBoard, (board) => board.cardsInArchivedLists),
    archivedCards: cardRows.filter((card) => card.closed).length,
    templates: cardRows.filter((card) => card.isTemplate).length,
    archivedTemplates: cardRows.filter((card) => card.isTemplate && card.closed).length,
    templateTitles: counts(cardRows.filter((card) => card.isTemplate), (card) => card.name),
    templatesInArchivedLists: cardRows.filter((card) => card.isTemplate && listRows.find((list) => list.id === card.idList)?.closed).length,
    unarchivedCardsInArchivedLists: cardRows.filter((card) => !card.closed && listRows.find((list) => list.id === card.idList)?.closed).length,
    attachments: attachmentRows.length, attachmentBytes: sum(attachmentRows, (attachment) => attachment.bytes ?? 0),
    uploadAttachments: attachmentRows.filter((attachment) => attachment.isUpload).length,
    externalAttachments: attachmentRows.filter((attachment) => !attachment.isUpload).length,
    attachmentsOver25MiB: attachmentRows.filter((attachment) => attachment.reasons.includes('over_25_mib')).length,
    unsupportedAttachments: attachmentRows.filter((attachment) => attachment.reasons.includes('unsupported_extension')).length,
    uniqueFilePolicyExceptions: attachmentRows.filter((attachment) => attachment.reasons.some((reason) => reason !== 'external_link')).length,
    attachmentExtensions: counts(attachmentRows, (attachment) => attachment.ext), attachmentHosts: counts(attachmentRows, (attachment) => attachment.host),
    checklists: sum(boards, (board) => board.checklists.length), checklistItems: sum(boards, (board) => sum(board.checklists, (check) => check.checkItems.length)),
    membersUnique: identityRows.length, memberBoardLinks: memberRows.length,
    actionAuthorsUnique: actionAuthorIds.size, identitiesInMembersOrActions: knownIdentityIds.size,
    creatorIdsUnique: creatorIds.size, creatorIdsOutsideMembersAndActions: [...creatorIds].filter((id) => !knownIdentityIds.has(id)).length,
    cardsWithCreatorOutsideMembersAndActions: cardRows.filter((card) => card.idMemberCreator && !knownIdentityIds.has(card.idMemberCreator)).length,
    labelDefinitions: labelRows.length, labelNamesNormalized: labelPatterns.length,
    exportedComments: sum(byBoard, (board) => board.exportedComments), missingCommentsByBadge: sum(byBoard, (board) => board.missingCommentsByBadge),
    actions: sum(byBoard, (board) => board.actions), boardsAtActionCap: byBoard.filter((board) => board.atActionCap).length,
    completedOutsideFinal: sum(byBoard, (board) => board.completedOutsideFinal), incompleteInFinal: sum(byBoard, (board) => board.incompleteInFinal),
    withDue: cardRows.filter((card) => card.due).length, withStart: cardRows.filter((card) => card.start).length,
    withDescription: cardRows.filter((card) => card.desc).length, withoutAssignees: cardRows.filter((card) => !card.idMembers.length).length,
    titlesWithDatePrefix: cardRows.filter((card) => /^\d{1,2}[\/-]\d{1,2}/.test(card.name)).length,
    datePrefixWithoutDue: cardRows.filter((card) => !card.due && /^\d{1,2}[\/-]\d{1,2}/.test(card.name)).length,
    drivePathsWithoutUrl: findings.filter((finding) => finding.code === 'drive_path_without_url').length,
    maxCardsInList: Math.max(0, ...listRows.map((list) => list.cards)),
    recurrenceRules: cardRows.filter((card) => card.recurrenceRule).length,
    duplicateCardIdGroups: duplicateCardIds.length, duplicateNormalizedTitleGroups: duplicateTitles.length,
    findings: counts(findings, (finding) => finding.code),
  };
  return { publicReport: { scope: 'Snapshots fornecidos; não comprova inventário completo da conta Trello', totals, byBoard, listPatterns, labelPatterns, fieldPatterns },
    privateReport: { findings, identities: identityRows, duplicateCardIds, duplicateTitles,
      attachmentExceptions: attachmentRows.filter((row) => row.reasons.length), listRows } };
}

async function main() {
  const source = path.resolve(process.argv[2] ?? path.join(local, 'originals'));
  const files = await jsonFiles(source);
  if (!files.length) throw new Error('Nenhum JSON encontrado');
  const records = [];
  for (const filename of files) {
    const bytes = await readFile(path.join(source, filename));
    const board = JSON.parse(bytes.toString('utf8'));
    const result = catalogBoard(board, bytes, filename);
    records.push({ filename, bytes, board, result });
  }
  const { publicReport, privateReport } = analyzeWorkspace(records);
  // Só escreve depois de todos os arquivos terem sido lidos e validados.
  for (const record of records) {
    const originalPath = path.join(local, 'originals', record.filename);
    const catalogPath = path.join(local, 'catalog', `${record.board.id}.json`);
    await mkdir(path.dirname(originalPath), { recursive: true });
    await mkdir(path.dirname(catalogPath), { recursive: true });
    if (path.resolve(originalPath) !== path.resolve(source, record.filename)) await writeFile(originalPath, record.bytes);
    await writeFile(catalogPath, JSON.stringify(record.result.catalog, null, 2) + '\n');
  }
  for (const [filename, value] of [
    ['research/trello/all-summary.json', records.map((record) => record.result.summary)],
    ['research/trello/patterns.json', publicReport],
    ['research/trello/local/workspace/quality-details.json', privateReport],
  ]) await writeFile(path.join(root, filename), JSON.stringify(value, null, 2) + '\n');
  console.log(JSON.stringify(publicReport.totals, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
