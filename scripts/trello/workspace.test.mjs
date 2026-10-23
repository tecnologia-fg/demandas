import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeWorkspace, normalize, allowedExtensions } from './workspace.mjs';
import { catalogBoard } from './catalog.mjs';

function fixture() {
  const board = { id: 'board', name: 'Exemplo', lists: [{ id: 'list', name: 'PLANEJAMENTO', closed: false, pos: 1 }],
    cards: [{ id: 'card', idBoard: 'board', idList: 'list', name: 'Exemplo', desc: '', pos: 1, closed: false,
      dueComplete: false, idMembers: [], idLabels: [], idChecklists: [], customFieldItems: [], attachments: [], badges: { comments: 0, attachments: 0 } }],
    labels: [], members: [], customFields: [], actions: [], checklists: [] };
  return { board, bytes: Buffer.from(JSON.stringify(board)) };
}

test('normaliza grafia e espaços sem apagar diferenças de significado', () => {
  assert.equal(normalize('  CAPTACÃO | REUNIÃO  '), normalize('CAPTAÇÃO | REUNIÃO'));
  assert.notEqual(normalize('APROVADO'), normalize('CONCLUÍDO'));
});

test('preserva card em lista arquivada sem inventar arquivamento individual', () => {
  const record = fixture(); record.board.lists[0].closed = true;
  const report = analyzeWorkspace([record]).publicReport;
  assert.equal(report.totals.cardsInArchivedLists, 1);
  assert.equal(report.totals.unarchivedCardsInArchivedLists, 1);
  assert.equal(report.totals.archivedCards, 0);
  assert.equal(catalogBoard(record.board, record.bytes, 'fixture').catalog.cards[0].closed, false);
});

test('conta interseção de tamanho e extensão uma vez, e separa link externo', () => {
  const record = fixture();
  record.board.cards[0].attachments = [
    { id: 'a', name: 'arquivo.svg', url: 'https://trello.com/a', bytes: 26 * 1024 * 1024, isUpload: true },
    { id: 'b', name: 'Link', url: 'https://example.com/', bytes: 0, isUpload: false },
  ];
  const totals = analyzeWorkspace([record]).publicReport.totals;
  assert.equal(totals.attachmentsOver25MiB, 1);
  assert.equal(totals.unsupportedAttachments, 1);
  assert.equal(totals.uniqueFilePolicyExceptions, 1);
  assert.equal(totals.externalAttachments, 1);
});

test('apura comentários ausentes por card, sem compensar excesso de outro card', () => {
  const record = fixture(); const card = record.board.cards[0]; card.badges.comments = 2;
  record.board.cards.push({ ...structuredClone(card), id: 'card2', badges: { comments: 0, attachments: 0 } });
  record.board.actions = [{ id: 'a', type: 'commentCard', data: { card: { id: 'card2' } } }];
  assert.equal(analyzeWorkspace([record]).publicReport.totals.missingCommentsByBadge, 2);
});

test('rejeita snapshots duplicados e cards sem lista; títulos iguais não são IDs iguais', () => {
  const record = fixture();
  assert.throws(() => analyzeWorkspace([record, record]), /Quadro duplicado/);
  record.board.cards.push({ ...structuredClone(record.board.cards[0]), id: 'card2' });
  const totals = analyzeWorkspace([record]).publicReport.totals;
  assert.equal(totals.distinctCardIds, 2);
  assert.equal(totals.duplicateNormalizedTitleGroups, 1);
  record.board.cards[0].idList = 'missing';
  assert.throws(() => catalogBoard(record.board, record.bytes, 'fixture'), /card sem lista/);
});

test('política de extensões analisada acompanha storage do Dmanda', async () => {
  const storage = await readFile(new URL('../../src/server/storage.ts', import.meta.url), 'utf8');
  const body = storage.split('export const ALLOWED:')[1].split('};')[0];
  const keys = [...body.matchAll(/\b([a-z0-9]+):\s*"/g)].map((match) => match[1]);
  assert.deepEqual([...allowedExtensions].sort(), keys.sort());
});
