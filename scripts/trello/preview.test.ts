import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chooseBoard, exportPlan, initialChoice, parseTrello, restorePlan, validateChoice, type DestinationOptions, type PreviewSource } from "../../src/lib/trello/preview";

const options: DestinationOptions = { boards: [{ id: "target", name: "Destino", clientId: null, columns: [{ id: "inbox", name: "Caixa de entrada", isDone: false }, { id: "done", name: "Concluído", isDone: true }] }], users: [{ id: "user", name: "Pessoa" }], clients: [], labels: [] };
const hash = "a".repeat(64);
function fixture() {
  return { id: "board", name: "Exemplo", closed: false, lists: [{ id: "list", name: "PLANEJAMENTO", closed: false, pos: 1 }], members: [{ id: "person", fullName: "Pessoa" }], labels: [], checklists: [], customFields: [], actions: [],
    cards: [{ id: "card", idBoard: "board", idList: "list", name: "Card", pos: 1, closed: false, dueComplete: false, isTemplate: true, idMembers: ["person"], idLabels: [], idChecklists: [], customFieldItems: [], badges: { comments: 2, attachments: 0 }, attachments: [] }] };
}
function source() { return parseTrello(JSON.stringify(fixture()), "board.json", hash); }

test("sugere Planejamento para Caixa de entrada e associa apenas ao quadro escolhido", () => {
  const board = source(); const initial = initialChoice(board, options);
  assert.equal(initial.lists[0].name, "Caixa de entrada");
  assert.equal(initial.reviewed, false);
  const mapped = chooseBoard(board, initial, "target", options);
  assert.equal(mapped.lists[0].mode, "existing"); assert.equal(mapped.lists[0].targetColumnId, "inbox");
  assert.deepEqual(validateChoice(board, mapped, options), []);
  mapped.targetBoardId = "other";
  assert.ok(validateChoice(board, mapped, options).length > 0);
});
test("não omite cards nem associa lista arquivada a coluna ativa", () => {
  const raw = fixture(); raw.lists[0].closed = true;
  const board = parseTrello(JSON.stringify(raw), "board.json", hash);
  const choice = chooseBoard(board, initialChoice(board, options), "target", options);
  assert.equal(choice.lists[0].mode, "new"); assert.equal(choice.lists[0].archived, true);
  choice.lists[0].mode = "omit";
  assert.ok(validateChoice(board, choice, options).some((error) => error.includes("não pode ser omitida")));
  choice.lists[0].mode = "existing"; choice.lists[0].targetColumnId = "inbox";
  assert.ok(validateChoice(board, choice, options).some((error) => error.includes("incompatível")));
});
test("rejeita referências quebradas e IDs duplicados sem descartar cards", () => {
  const raw = fixture(); raw.cards[0].idList = "missing";
  assert.throws(() => parseTrello(JSON.stringify(raw), "board.json", hash), /inválido/);
  const duplicate = fixture(); duplicate.cards.push(duplicate.cards[0]);
  assert.throws(() => parseTrello(JSON.stringify(duplicate), "board.json", hash), /IDs repetidos/);
});
test("hash vincula plano às fontes; restauração invalida revisão e conserva decisões", () => {
  const board = source(); const choice = initialChoice(board, options); choice.reviewed = true;
  const plan = exportPlan([board], [choice], options);
  assert.equal(plan.status, "reviewed");
  const reopened = restorePlan(JSON.stringify(plan), [board]);
  assert.equal(reopened[0].reviewed, false); assert.deepEqual(reopened[0].lists, choice.lists);
  assert.throws(() => restorePlan(JSON.stringify(plan), [{ ...board, sha256: "b".repeat(64) }]), /arquivo diferente/);
  assert.throws(() => restorePlan(JSON.stringify({ ...plan, schemaVersion: 2 }), [board]), /versão incompatível/);
  const broken = structuredClone(plan); broken.boards[0].lists = [];
  assert.throws(() => restorePlan(JSON.stringify(broken), [board]), /mapa de listas incompleto/);
});
test("revisão não fica concluída com mapas inválidos ou revisão pendente", () => {
  const board = source(); const choice = initialChoice(board, options);
  assert.equal(exportPlan([board], [choice], options).status, "draft");
  choice.reviewed = true; choice.lists[0].name = "";
  assert.equal(exportPlan([board], [choice], options).status, "draft");
  choice.lists = [];
  assert.ok(validateChoice(board, choice, options).some((error) => error.includes("Mapa de listas")));
});
test("associações globais de pessoas conflitantes e card repetido são detectados", () => {
  const first = source(); const second = { ...first, id: "board2", cardIds: ["card2"] };
  const one = initialChoice(first, options), two = initialChoice(second, options);
  two.people.person = "user";
  assert.ok(exportPlan([first, second], [one, two], options).errors.some((error) => error.includes("associação diferente")));
  assert.throws(() => exportPlan([first, { ...second, cardIds: first.cardIds }], [one, two], options), /mesmo card/);
});
test("os 14 exports reais conservam os totais do inventário quando disponíveis", async (context) => {
  let manifest: { filename: string; sha256: string; cards: number; archivedCards: number; attachments: number; exportedComments: number }[];
  try { manifest = JSON.parse(await readFile("research/trello/all-summary.json", "utf8")); }
  catch { context.skip("Manifesto local ausente"); return; }
  const sources: PreviewSource[] = [];
  for (const item of manifest) {
    let bytes: Buffer;
    try { bytes = await readFile(`research/trello/local/workspace/originals/${item.filename}`); }
    catch { context.skip("Fontes privadas não acompanham um clone do projeto"); return; }
    const parsed = parseTrello(bytes.toString("utf8"), item.filename, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(parsed.sha256, item.sha256); assert.equal(parsed.totals.cards, item.cards);
    assert.equal(parsed.totals.archived, item.archivedCards); assert.equal(parsed.totals.attachments, item.attachments); assert.equal(parsed.totals.comments, item.exportedComments);
    sources.push(parsed);
  }
  const sum = (code: string) => sources.reduce((total, source) => total + (source.issues.find((issue) => issue.code === code)?.count ?? 0), 0);
  assert.equal(sources.length, 14); assert.equal(sources.reduce((total, source) => total + source.totals.cards, 0), 1766);
  assert.equal(sum("file_policy"), 31); assert.equal(sum("missing_comments"), 105); assert.equal(sum("archived_list"), 75); assert.equal(sum("completion"), 185);
  const plan = exportPlan(sources, sources.map((source) => initialChoice(source, options)), options);
  assert.deepEqual(plan.errors, []); assert.equal(plan.status, "draft");
});
