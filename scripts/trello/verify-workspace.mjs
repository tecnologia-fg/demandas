import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWorkspace } from './workspace.mjs';
import { catalogBoard } from './catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, 'research/trello/local/workspace');
const source = path.resolve(process.argv[2] ?? path.join(local, 'originals'));
const readJson = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const manifest = await readJson(path.join(root, 'research/trello/all-summary.json'));
const patterns = await readJson(path.join(root, 'research/trello/patterns.json'));
const records = [];
const seenIds = new Set();
const sorted = (items) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
const cardFields = {
  sourceId: 'id', sourceNumber: 'idShort', url: 'url', title: 'name', descriptionMarkdown: 'desc',
  sourceListId: 'idList', sourcePosition: 'pos', closed: 'closed', dateClosed: 'dateClosed', dueComplete: 'dueComplete',
  dateCompleted: 'dateCompleted', start: 'start', due: 'due', dateLastActivity: 'dateLastActivity',
  creatorSourceId: 'idMemberCreator', assigneeSourceIds: 'idMembers', labelSourceIds: 'idLabels',
  cover: 'cover', coverAttachmentSourceId: 'idAttachmentCover', isTemplate: 'isTemplate', recurrenceRule: 'recurrenceRule',
};
for (const entry of manifest) {
  const bytes = await readFile(path.join(source, entry.filename));
  assert.deepEqual(await readFile(path.join(local, 'originals', entry.filename)), bytes, `${entry.filename}: cópia difere da fonte`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  const board = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(entry, catalogBoard(board, bytes, entry.filename).summary);
  assert.equal(board.id, entry.sourceId); assert.equal(board.name, entry.name);
  assert.ok(!seenIds.has(board.id)); seenIds.add(board.id);
  const catalog = await readJson(path.join(local, 'catalog', `${board.id}.json`));
  assert.equal(catalog.sourceBoardId, board.id);
  assert.deepEqual(catalog.members, board.members); assert.deepEqual(catalog.labels, board.labels);
  assert.deepEqual(catalog.customFields, board.customFields); assert.deepEqual(catalog.lists, sorted(board.lists));
  assert.equal(catalog.cards.length, board.cards.length);
  assert.equal(new Set(catalog.cards.map((card) => card.sourceId)).size, board.cards.length);
  const expectedOrder = sorted(board.lists).flatMap((list) => sorted(board.cards.filter((card) => card.idList === list.id)).map((card) => card.id));
  assert.deepEqual(catalog.cards.map((card) => card.sourceId), expectedOrder);
  for (const card of board.cards) {
    const result = catalog.cards.find((item) => item.sourceId === card.id); assert.ok(result);
    for (const [targetKey, sourceKey] of Object.entries(cardFields)) assert.deepEqual(result[targetKey], card[sourceKey], `${entry.name}/${card.id}/${sourceKey}`);
    assert.equal(result.attachments.length, card.attachments.length);
    for (const attachment of card.attachments) {
      const output = result.attachments.find((item) => item.id === attachment.id); assert.ok(output);
      for (const key of Object.keys(attachment)) assert.deepEqual(output[key], attachment[key]);
      assert.equal(output.localFileAvailable, false);
    }
    const checklists = sorted(card.idChecklists.map((id) => board.checklists.find((item) => item.id === id)));
    assert.deepEqual(result.checklists, checklists.map((check) => ({ ...check, checkItems: sorted(check.checkItems) })));
    const comments = board.actions.filter((action) => action.type === 'commentCard' && action.data.card?.id === card.id);
    assert.deepEqual(result.comments, comments.map((action) => ({ sourceId: action.id, authorSourceId: action.idMemberCreator,
      author: action.memberCreator ?? null, date: action.date, text: action.data.text })));
    assert.equal(result.customFields.length, card.customFieldItems.length);
    for (const item of card.customFieldItems) {
      const field = board.customFields.find((field) => field.id === item.idCustomField);
      const value = result.customFields.find((value) => value.sourceId === item.idCustomField); assert.ok(value);
      assert.equal(value.name, field.name);
      assert.deepEqual(value.value, field.options?.find((option) => option.id === item.idValue)?.value.text ?? item.value ?? null);
    }
  }
  records.push({ board, bytes });
}
async function filesIn(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path.join(dir, entry.name), rel));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) result.push(rel);
  }
  return result.sort();
}
assert.deepEqual(await filesIn(source), manifest.map((entry) => entry.filename).sort(), 'A fonte contém arquivos fora do manifesto ou faltando');
assert.deepEqual(await filesIn(path.join(local, 'originals')), manifest.map((entry) => entry.filename).sort());
const actual = analyzeWorkspace(records);
assert.deepEqual(patterns, actual.publicReport);
assert.deepEqual(await readJson(path.join(local, 'quality-details.json')), actual.privateReport);
// Totais independentes do analisador: reduzir diretamente a fonte, não os resumos.
const boards = records.map((record) => record.board);
const cards = boards.flatMap((board) => board.cards);
assert.equal(patterns.totals.cards, cards.length);
assert.equal(patterns.totals.attachments, cards.flatMap((card) => card.attachments).length);
assert.equal(patterns.totals.archivedCards, cards.filter((card) => card.closed).length);
assert.equal(patterns.totals.templates, cards.filter((card) => card.isTemplate).length);
assert.equal(patterns.totals.checklistItems, boards.flatMap((board) => board.checklists.flatMap((check) => check.checkItems)).length);
assert.equal(patterns.totals.exportedComments, boards.flatMap((board) => board.actions.filter((action) => action.type === 'commentCard')).length);
console.log(`Integridade verificada: ${boards.length} fontes byte a byte; ${cards.length} cards com campos, relações, ordem e conteúdo; manifesto, padrões e pendências reproduzidos.`);
