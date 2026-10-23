import test from "node:test";
import assert from "node:assert/strict";
import { prepareApprovalFlows, preparePlan } from "./import-plan";
import { initialChoice, parseTrello, exportPlan, type DestinationOptions } from "../../src/lib/trello/preview";
import { resolveApprovalFlow } from "../../src/lib/trello/approval-flow";

const source = parseTrello(JSON.stringify({ id: "source", name: "Cliente", closed: false,
  lists: [{ id: "list", name: "Planejamento", pos: 1, closed: false }], members: [{ id: "person", fullName: "Pessoa" }],
  labels: [{ id: "source-label", name: "Arte", color: "blue" }], cards: [], actions: [], checklists: [], customFields: [],
}), "source.json", "a".repeat(64));
const options: DestinationOptions = { boards: [], clients: [{ id: "vps-client", name: "Cliente" }], users: [{ id: "vps-user", name: "Pessoa" }], labels: [{ id: "vps-label", name: "Criação", color: "#123456" }] };
const make = () => { const choice = initialChoice(source, options); choice.people.person = "vps-user"; choice.labels["source-label"] = "vps-label"; choice.reviewed = true; return exportPlan([source], [choice], options); };
test("executor valida hashes, revisão e destinos; associa IDs portáveis somente por mapa explícito", () => {
  const plan = make(); assert.equal(preparePlan(plan, [source], options).status, "reviewed");
  assert.throws(() => preparePlan({ ...plan, status: "draft" }, [source], options));
  assert.throws(() => preparePlan(plan, [{ ...source, sha256: "b".repeat(64) }], options), /hash/);
  const local = structuredClone(plan); local.boards[0].people.person = "local-user"; local.boards[0].clientId = "local-client"; local.boards[0].labels["source-label"] = "local-label";
  assert.throws(() => preparePlan(local, [source], options), /indisponível/);
  const result = preparePlan(local, [source], options, { users: { "local-user": "vps-user" }, clients: { "local-client": "vps-client" }, labels: { "local-label": "vps-label" } });
  assert.equal(result.boards[0].people.person, "vps-user"); assert.equal(result.boards[0].clientId, "vps-client");
});
test("revisão global de etiquetas rejeita fontes alteradas e diferencia ignorar de criar", () => {
  const review = { kind: "dmanda-trello-label-associations", schemaVersion: 1, associations: [{ sourceBoardId: source.id, sourceLabelId: "source-label", sourceName: "Arte", sourceColor: "blue", action: "ignore", target: null }] };
  const result = preparePlan(make(), [source], options, {}, review); assert.equal(result.boards[0].labels["source-label"], "__ignore__");
  review.associations[0].sourceName = "Alterada"; assert.throws(() => preparePlan(make(), [source], options, {}, review), /differs/);
});
test("destinos de aprovação permanecem por ID após renomear/reordenar e rejeitam colunas inválidas", () => {
  const columns = [{ id: "send", name: "Nome livre", isDone: false }, { id: "approved", name: "Agendar", isDone: false }, { id: "changes", name: "Ajustes", isDone: false }, { id: "published", name: "Publicado", isDone: true }];
  const flow = { approval: "send", next: "approved", back: "changes", done: "published" };
  assert.equal(resolveApprovalFlow(flow, columns.reverse()).next.id, "approved");
  assert.throws(() => resolveApprovalFlow({ ...flow, next: "changes" }, columns), /diferentes/);
  assert.throws(() => resolveApprovalFlow(flow, columns.filter((c) => c.id !== "send")), /arquivada/);
  assert.throws(() => resolveApprovalFlow({ ...flow, next: "published", done: "approved" }, columns), /conclusão/);
});
test("fluxo portável cria etapas adicionais sem alterar listas da origem", () => {
  const plan = make(), raw = { kind: "dmanda-trello-approval-flows", schemaVersion: 1, flows: [{ sourceBoardId: source.id,
    approval: { sourceListId: "list" }, next: { newColumn: { key: "next", name: "Aprovado / Agendar", isDone: false } },
    back: { newColumn: { key: "back", name: "Ajustes", isDone: false } }, done: { newColumn: { key: "done", name: "Publicado", isDone: true } } }] };
  const result = prepareApprovalFlows(raw, plan, options);
  assert.equal(result.extraColumns.source.length, 3); assert.equal(plan.boards[0].lists.length, 1);
  assert.equal(result.flows.source.next, result.extraColumns.source.find((c) => c.key === "next")?.id);
  assert.deepEqual(prepareApprovalFlows(raw, plan, options), result);
});
