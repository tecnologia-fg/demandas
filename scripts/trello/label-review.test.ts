import test from "node:test";
import assert from "node:assert/strict";
import { labelGroups, remapCardLabels, type SourceLabel } from "../../src/lib/trello/label-review";
import { initialChoice, chooseBoard, parseTrello, validateChoice, exportPlan, restorePlan, IGNORE_LABEL_TARGET, type DestinationOptions } from "../../src/lib/trello/preview";

test("agrupa nomes repetidos e mantém etiquetas sem nome separadas", () => {
  const source = (id: string, name: string): SourceLabel => ({ id, externalId: id, name, color: "red", boardId: id, targetId: id, status: "IMPORTED" });
  const groups = labelGroups([source("a", "Tráfego Pago"), source("b", "trafego_pago"), source("c", ""), source("d", "")], [{ id: "card", sourceLabels: ["a", "b"], labels: ["a", "b"] }]);
  assert.equal(groups.length, 3); assert.equal(groups[0].sourceIds.length, 2); assert.equal(groups[0].cards, 1);
});
test("merge elimina vínculo repetido e conserva etiqueta adicionada fora da importação", () => {
  const before = new Map([["a", "old"], ["b", "target"]]), after = new Map([["a", "target"], ["b", "target"]]);
  assert.deepEqual(remapCardLabels({ id: "card", sourceLabels: ["a", "b"], labels: ["old", "target", "manual"] }, before, after, new Set(["a"])), ["manual", "target"]);
});
test("ignorar mantém destino que ainda representa outra etiqueta de origem", () => {
  const before = new Map([["a", "same"], ["b", "same"]]), after = new Map<string, string | null>([["a", null], ["b", "same"]]);
  assert.deepEqual(remapCardLabels({ id: "c", sourceLabels: ["a", "b"], labels: ["same"] }, before, after, new Set(["a"])), ["same"]);
  assert.deepEqual(remapCardLabels({ id: "c", sourceLabels: ["a"], labels: ["same"] }, before, after, new Set(["a"])), []);
});
test("sugere cliente pelo nome do quadro e exporta ignorar como decisão distinta de criar etiqueta", () => {
  const options: DestinationOptions = { clients: [{ id: "client", name: "SPMAR" }], boards: [], users: [], labels: [] };
  const source = parseTrello(JSON.stringify({ id: "board", name: "SPMAR - Complexo Alto do Tietê", closed: false, lists: [], members: [], labels: [{ id: "label", name: "STORY", color: "blue" }], cards: [], checklists: [], actions: [], customFields: [] }), "fixture.json", "a".repeat(64));
  const choice = initialChoice(source, options); assert.equal(choice.clientId, "client");
  const existingOptions = { ...options, boards: [{ id: "existing", name: "Sem cliente", clientId: null, columns: [] }] };
  assert.equal(chooseBoard(source, choice, "existing", existingOptions).clientId, "");
  choice.labels.label = IGNORE_LABEL_TARGET; choice.reviewed = true;
  assert.deepEqual(validateChoice(source, choice, options), []);
  const plan = exportPlan([source], [choice], options); assert.equal(plan.status, "reviewed");
  assert.equal(restorePlan(JSON.stringify(plan), [source])[0].labels.label, IGNORE_LABEL_TARGET);
  choice.labels.label = "invalid"; assert.ok(validateChoice(source, choice, options).length);
});
