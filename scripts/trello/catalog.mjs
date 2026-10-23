import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ordered = (items) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
const countBy = (items, key) => items.reduce((out, item) => {
  const value = key(item) ?? '(vazio)';
  out[value] = (out[value] ?? 0) + 1;
  return out;
}, {});

// Catálogo de pesquisa: sem conexão com banco, downloads ou mutações no Trello.
export function catalogBoard(board, bytes, filename) {
  for (const key of ['cards', 'lists', 'members', 'labels', 'checklists', 'actions', 'customFields']) {
    if (!Array.isArray(board[key])) throw new Error(`${filename}: ${key} deve ser uma lista`);
    const ids = board[key].map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`${filename}: IDs duplicados em ${key}`);
  }
  const lists = new Map(board.lists.map((list) => [list.id, list]));
  const fields = new Map(board.customFields.map((field) => [field.id, field]));
  const members = new Map(board.members.map((member) => [member.id, member]));
  const labels = new Map(board.labels.map((label) => [label.id, label]));
  const checks = new Map(board.checklists.map((check) => [check.id, check]));
  const warnings = [];
  const comments = board.actions.filter((action) => action.type === 'commentCard');
  const cards = ordered(board.lists).flatMap((list) => ordered(board.cards.filter((card) => card.idList === list.id)));
  if (cards.length !== board.cards.length) throw new Error(`${filename}: card sem lista conhecida`);
  const catalog = cards.map((card) => {
    if (card.idBoard !== board.id) throw new Error(`${filename}: card de outro quadro`);
    const cardWarnings = [];
    const customFields = (card.customFieldItems ?? []).map((item) => {
      const field = fields.get(item.idCustomField);
      const option = field?.options?.find((option) => option.id === item.idValue);
      if (!field || (item.idValue && !option)) cardWarnings.push(`Campo/opção desconhecido: ${item.idCustomField}`);
      return { sourceId: item.idCustomField, name: field?.name ?? null, type: field?.type ?? null,
        value: option?.value?.text ?? item.value ?? null, sourceOptionId: item.idValue ?? null };
    });
    for (const [kind, ids, map] of [['membro', card.idMembers, members], ['etiqueta', card.idLabels, labels], ['checklist', card.idChecklists, checks]]) {
      for (const id of ids ?? []) if (!map.has(id)) cardWarnings.push(`${kind} ausente: ${id}`);
    }
    const cardComments = comments.filter((action) => action.data.card?.id === card.id);
    const priority = customFields.find((field) => field.name === 'Prioridade')?.value;
    if (priority && !['Normal', 'Alta', 'Urgente'].includes(priority)) cardWarnings.push(`Prioridade sem regra: ${priority}`);
    if ((card.badges?.comments ?? 0) > cardComments.length) cardWarnings.push('Comentários incompletos no export');
    if (card.closed && !card.dateClosed) cardWarnings.push('Arquivado sem data de arquivamento');
    if (card.dueComplete && !card.dateCompleted) cardWarnings.push('Concluído sem data de conclusão');
    const attachments = (card.attachments ?? []).map((attachment) => ({ ...attachment,
      localFileAvailable: false, exceedsDmandaLimit: attachment.bytes > 25 * 1024 * 1024 }));
    warnings.push(...cardWarnings.map((message) => ({ cardId: card.id, message })));
    return {
      sourceId: card.id, sourceNumber: card.idShort, url: card.url, title: card.name,
      descriptionMarkdown: card.desc, sourceListId: card.idList, listName: lists.get(card.idList).name,
      sourcePosition: card.pos, proposedPosition: cards.filter((other) => other.idList === card.idList).indexOf(card),
      closed: card.closed, dateClosed: card.dateClosed, dueComplete: card.dueComplete,
      dateCompleted: card.dateCompleted, start: card.start, due: card.due,
      dateLastActivity: card.dateLastActivity, creatorSourceId: card.idMemberCreator,
      assigneeSourceIds: card.idMembers, labelSourceIds: card.idLabels,
      cover: card.cover, coverAttachmentSourceId: card.idAttachmentCover, isTemplate: card.isTemplate,
      recurrenceRule: card.recurrenceRule, customFields,
      proposedPriority: { Normal: 'MEDIUM', Alta: 'HIGH', Urgente: 'URGENT' }[priority] ?? null,
      checklists: ordered((card.idChecklists ?? []).map((id) => checks.get(id)).filter(Boolean)).map((check) => ({
        ...check, checkItems: ordered(check.checkItems),
      })),
      comments: cardComments.map((action) => ({ sourceId: action.id, authorSourceId: action.idMemberCreator,
        author: action.memberCreator ?? null, date: action.date, text: action.data.text })),
      attachments, warnings: cardWarnings,
    };
  });
  const attachments = catalog.flatMap((card) => card.attachments);
  const dates = board.actions.map((action) => action.date).sort();
  const summary = {
    name: board.name, sourceId: board.id, filename, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    cards: catalog.length, archivedCards: catalog.filter((card) => card.closed).length,
    dueCompleteCards: catalog.filter((card) => card.dueComplete).length,
    withDue: catalog.filter((card) => card.due).length, withStart: catalog.filter((card) => card.start).length,
    withDescription: catalog.filter((card) => card.descriptionMarkdown).length,
    members: members.size, labels: labels.size,
    lists: ordered(board.lists).map((list) => ({ id: list.id, name: list.name, closed: list.closed,
      cards: catalog.filter((card) => card.sourceListId === list.id).length })),
    checklists: checks.size, checklistItems: board.checklists.reduce((sum, check) => sum + check.checkItems.length, 0),
    customFields: board.customFields.map((field) => ({ name: field.name, type: field.type,
      options: field.options?.map((option) => option.value.text) ?? [],
      values: countBy(catalog.flatMap((card) => card.customFields).filter((item) => item.sourceId === field.id),
        (item) => typeof item.value === 'string' && field.type === 'list' ? item.value : '(preenchido)') })),
    attachments: attachments.length, attachmentBytes: attachments.reduce((sum, item) => sum + (item.bytes ?? 0), 0),
    attachmentsOver25MB: attachments.filter((item) => item.exceedsDmandaLimit).length,
    attachmentExtensions: countBy(attachments, (item) => path.extname(item.fileName ?? item.name).toLowerCase()),
    actions: board.actions.length, actionTypes: countBy(board.actions, (action) => action.type),
    actionRange: { oldest: dates[0] ?? null, newest: dates.at(-1) ?? null },
    exportedComments: comments.length, badgeComments: board.cards.reduce((sum, card) => sum + (card.badges?.comments ?? 0), 0),
    actionsForAbsentCards: board.actions.filter((action) => action.data.card && !catalog.some((card) => card.sourceId === action.data.card.id)).length,
    priorityDistribution: countBy(catalog, (card) => card.proposedPriority),
    completionByList: ordered(board.lists).map((list) => ({ name: list.name,
      total: catalog.filter((card) => card.sourceListId === list.id).length,
      dueComplete: catalog.filter((card) => card.sourceListId === list.id && card.dueComplete).length })),
    warnings: countBy(warnings, (warning) => warning.message),
  };
  return { summary, catalog: { sourceBoardId: board.id, boardName: board.name,
    board: { description: board.desc, closed: board.closed, dateClosed: board.dateClosed, url: board.url },
    lists: ordered(board.lists), members: board.members,
    labels: board.labels, customFields: board.customFields, cards: catalog, warnings } };
}

async function main() {
  const sourceDir = path.join(root, 'research/trello/local/originals');
  const outputDir = path.join(root, 'research/trello/local/catalog');
  await mkdir(outputDir, { recursive: true });
  const summaries = [];
  for (const name of ['spmar', 'cevisa']) {
    const filename = `${name}.json`;
    const bytes = await readFile(path.join(sourceDir, filename));
    const result = catalogBoard(JSON.parse(bytes.toString('utf8')), bytes, filename);
    await writeFile(path.join(outputDir, filename), JSON.stringify(result.catalog, null, 2) + '\n');
    summaries.push(result.summary);
  }
  await writeFile(path.join(root, 'research/trello/summary.json'), JSON.stringify(summaries, null, 2) + '\n');
  console.log(JSON.stringify(summaries.map(({ name, cards, attachments, warnings }) => ({ name, cards, attachments, warnings })), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
