import { z } from "zod";
import { attachmentReportRow, supportedAttachmentExtensions, type AttachmentReportRow, type AttachmentGap } from "./attachments";

export const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
export const IGNORE_LABEL_TARGET = "__ignore__";
const id = z.string().min(1).max(100);
const person = z.object({ id, fullName: z.string().optional(), username: z.string().optional() });
const sourceSchema = z.object({
  id, name: z.string().min(1), closed: z.boolean(),
  lists: z.array(z.object({ id, name: z.string(), closed: z.boolean(), pos: z.number().finite() })),
  members: z.array(person), labels: z.array(z.object({ id, name: z.string(), color: z.string().nullable() })),
  cards: z.array(z.object({
    id, idBoard: id, idList: id, name: z.string(), pos: z.number().finite(), closed: z.boolean(),
    url: z.string().optional(),
    dueComplete: z.boolean(), isTemplate: z.boolean().optional().default(false),
    due: z.string().nullable().optional(), dateCompleted: z.string().nullable().optional(),
    idMembers: z.array(id), idLabels: z.array(id), idChecklists: z.array(id),
    idMemberCreator: id.nullable().optional(), idAttachmentCover: z.string().nullable().optional(),
    badges: z.object({ comments: z.number().nonnegative().optional(), attachments: z.number().nonnegative().optional() }),
    attachments: z.array(z.object({ id, name: z.string(), fileName: z.string().optional(), url: z.string().optional(), isUpload: z.boolean(), bytes: z.number().nonnegative().nullable().optional() })),
    customFieldItems: z.array(z.object({ idCustomField: id, idValue: id.nullable().optional(), value: z.unknown().optional() })).default([]),
  })),
  actions: z.array(z.object({ id, type: z.string(), idMemberCreator: id.optional(), memberCreator: person.optional(), data: z.object({ card: z.object({ id }).optional() }) })),
  checklists: z.array(z.object({ id, idCard: id, checkItems: z.array(z.object({ id, due: z.string().nullable().optional(), idMember: id.nullable().optional() })) })),
  customFields: z.array(z.object({ id, name: z.string(), options: z.array(z.object({ id })).optional() })),
});
export type DestinationOptions = {
  boards: { id: string; name: string; clientId: string | null; columns: { id: string; name: string; isDone: boolean }[] }[];
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
};
export type PreviewIssue = { code: string; message: string; count: number };
export type PreviewSource = {
  id: string; name: string; filename: string; sha256: string; closed: boolean;
  cardIds: string[];
  attachments: AttachmentReportRow[]; attachmentGaps: AttachmentGap[];
  lists: { id: string; name: string; closed: boolean; cards: number; templates: number; samples: string[] }[];
  people: { id: string; name: string }[]; labels: { id: string; name: string; color: string | null }[];
  totals: { cards: number; archived: number; templates: number; attachments: number; comments: number; missingComments: number; checklists: number; checklistItems: number };
  issues: PreviewIssue[];
};
const extensions = supportedAttachmentExtensions;
const ordered = <T extends { id: string; pos: number }>(items: T[]) => [...items].sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
export function parseTrello(text: string, filename: string, sha256: string): PreviewSource {
  const parsed = sourceSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`${filename}: formato de exportação inválido (${parsed.error.issues[0]?.path.join(".")}).`);
  const board = parsed.data;
  for (const key of ["cards", "lists", "members", "labels", "checklists", "actions", "customFields"] as const) {
    if (new Set(board[key].map((item) => item.id)).size !== board[key].length) throw new Error(`${filename}: IDs repetidos em ${key}.`);
  }
  const lists = new Map(board.lists.map((list) => [list.id, list]));
  const fields = new Map(board.customFields.map((field) => [field.id, field]));
  const labels = new Set(board.labels.map((label) => label.id));
  const checks = new Map(board.checklists.map((check) => [check.id, check]));
  const people = new Map(board.members.map((member) => [member.id, { id: member.id, name: member.fullName || member.username || member.id }]));
  for (const action of board.actions) {
    const author = action.memberCreator;
    if (author && !people.has(author.id)) people.set(author.id, { id: author.id, name: author.fullName || author.username || author.id });
  }
  const comments = board.actions.filter((action) => action.type === "commentCard");
  const issues = new Map<string, PreviewIssue>();
  function warn(code: string, message: string, count = 1) {
    const previous = issues.get(code);
    issues.set(code, { code, message, count: (previous?.count ?? 0) + count });
  }
  let missingComments = 0;
  const attachments: AttachmentReportRow[] = [], attachmentGaps: AttachmentGap[] = [];
  for (const card of board.cards) {
    const list = lists.get(card.idList);
    if (!list || card.idBoard !== board.id) throw new Error(`${filename}: card ${card.id} aponta para quadro/lista inválido.`);
    if (card.idLabels.some((label) => !labels.has(label))) throw new Error(`${filename}: etiqueta de card ausente no export.`);
    if (card.idChecklists.some((check) => checks.get(check)?.idCard !== card.id)) throw new Error(`${filename}: checklist de card ausente ou de outro card.`);
    for (const field of card.customFieldItems) {
      const definition = fields.get(field.idCustomField);
      if (!definition || (field.idValue && !definition.options?.some((option) => option.id === field.idValue))) warn("unknown_field", "Campos ou opções sem definição; preservar origem e revisar.");
    }
    for (const personId of [...card.idMembers, ...(card.idMemberCreator ? [card.idMemberCreator] : [])]) {
      if (!people.has(personId)) people.set(personId, { id: personId, name: `Identidade externa ${personId}` });
    }
    const gap = Math.max(0, (card.badges.comments ?? 0) - comments.filter((action) => action.data.card?.id === card.id).length);
    missingComments += gap;
    if (gap) warn("missing_comments", "Comentários indicados pelos badges não estão no export.", gap);
    if ((card.badges.attachments ?? card.attachments.length) !== card.attachments.length) warn("attachment_badges", "Cards com divergência entre badges e anexos detalhados.");
    if ((card.badges.attachments ?? 0) > card.attachments.length) attachmentGaps.push({ cardId: card.id, cardTitle: card.name, cardUrl: card.url ?? "", missingCount: (card.badges.attachments ?? 0) - card.attachments.length });
    if (list.closed) warn("archived_list", "Cards em listas arquivadas precisam manter a visibilidade de arquivo.");
    const finalCandidate = ["concluido", "aprovado - concluido"].includes(normalize(list.name));
    if (card.dueComplete !== finalCandidate) warn("completion", "Cards com marca de conclusão diferente da etapa candidata a final.");
    for (const attachment of card.attachments) {
      attachments.push(attachmentReportRow({ boardId: board.id, boardName: board.name, cardId: card.id, cardTitle: card.name, cardUrl: card.url }, attachment));
      const ext = /\.([a-z0-9]+)$/i.exec(attachment.fileName ?? attachment.name)?.[1].toLowerCase();
      if (!attachment.isUpload) warn("links", "Referências externas serão preservadas como links.");
      else if ((attachment.bytes ?? 0) > 25 * 1024 * 1024 || !ext || !extensions.has(ext)) warn("file_policy", "Uploads exigem decisão de tamanho/formato antes da recuperação.");
    }
  }
  for (const action of comments) {
    if (action.idMemberCreator && !people.has(action.idMemberCreator)) people.set(action.idMemberCreator, { id: action.idMemberCreator, name: `Identidade externa ${action.idMemberCreator}` });
  }
  for (const check of board.checklists) {
    if (!board.cards.some((card) => card.id === check.idCard && card.idChecklists.includes(check.id))) throw new Error(`${filename}: checklist sem card correspondente.`);
    for (const item of check.checkItems) if (item.due || item.idMember) warn("advanced_checklist", "Itens de checklist com prazo/responsável precisam de suporte adicional.");
  }
  if (board.actions.length === 1000) warn("history_cap", "Histórico atingiu 1.000 ações; não comprova histórico completo.");
  warn("pending_files", "Os binários dos anexos não estão embutidos no JSON.", board.cards.reduce((sum, card) => sum + card.attachments.filter((item) => item.isUpload).length, 0));
  return {
    id: board.id, name: board.name, filename, sha256, closed: board.closed, cardIds: board.cards.map((card) => card.id), attachments, attachmentGaps,
    lists: ordered(board.lists).map((list) => {
      const cards = ordered(board.cards.filter((card) => card.idList === list.id));
      return { id: list.id, name: list.name, closed: list.closed, cards: cards.length, templates: cards.filter((card) => card.isTemplate).length, samples: cards.slice(0, 3).map((card) => card.name) };
    }),
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), labels: board.labels,
    totals: { cards: board.cards.length, archived: board.cards.filter((card) => card.closed).length,
      templates: board.cards.filter((card) => card.isTemplate).length, attachments: board.cards.reduce((sum, card) => sum + card.attachments.length, 0),
      comments: comments.length, missingComments, checklists: board.checklists.length, checklistItems: board.checklists.reduce((sum, check) => sum + check.checkItems.length, 0) },
    issues: [...issues.values()].filter((issue) => issue.count > 0),
  };
}

const listChoice = z.object({ sourceListId: id, mode: z.enum(["new", "existing", "omit"]), targetColumnId: z.string(), name: z.string(), isDone: z.boolean(), archived: z.boolean() });
export const boardChoiceSchema = z.object({
  sourceBoardId: id, targetBoardId: z.string(), name: z.string(), clientId: z.string(),
  completion: z.enum(["preserve", "column"]), reviewed: z.boolean(),
  lists: z.array(listChoice), people: z.record(z.string(), z.string()), labels: z.record(z.string(), z.string()),
});
export type BoardChoice = z.infer<typeof boardChoiceSchema>;
const draftSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("dmanda-trello-preview"),
  sources: z.array(z.object({ id, filename: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  boards: z.array(boardChoiceSchema),
});
export function suggestName(name: string) {
  const aliases: Record<string, string> = { planejamento: "Caixa de entrada", "em planejamento": "Caixa de entrada", "caixa de entrada": "Caixa de entrada", "em producao": "Produção", "em aprovacao": "Aprovação do cliente" };
  return aliases[normalize(name)] ?? name;
}
export function initialChoice(source: PreviewSource, options: DestinationOptions): BoardChoice {
  const exact = options.clients.filter((client) => normalize(client.name) === normalize(source.name));
  const parents = options.clients.filter((client) => normalize(source.name).startsWith(`${normalize(client.name)} - `));
  const suggestedClient = exact.length === 1 ? exact[0] : parents.length === 1 ? parents[0] : null;
  return { sourceBoardId: source.id, targetBoardId: "", name: source.name, clientId: suggestedClient?.id ?? "", completion: "preserve", reviewed: false,
    lists: source.lists.map((list) => ({ sourceListId: list.id, mode: list.closed && !list.cards ? "omit" : "new", targetColumnId: "", name: suggestName(list.name), isDone: normalize(list.name) === "concluido", archived: list.closed })),
    people: Object.fromEntries(source.people.map((person) => [person.id, ""])),
    labels: Object.fromEntries(source.labels.map((label) => {
      const matches = options.labels.filter((target) => normalize(target.name) === normalize(label.name) && label.name.trim());
      return [label.id, matches.length === 1 ? matches[0].id : ""];
    })),
  };
}
export function chooseBoard(source: PreviewSource, choice: BoardChoice, targetBoardId: string, options: DestinationOptions): BoardChoice {
  const target = options.boards.find((board) => board.id === targetBoardId);
  const next = initialChoice(source, options);
  return { ...choice, targetBoardId, reviewed: false, clientId: target ? target.clientId ?? "" : choice.clientId,
    lists: next.lists.map((list) => {
      const match = target?.columns.filter((column) => normalize(column.name) === normalize(list.name));
      return !list.archived && match?.length === 1 ? { ...list, mode: "existing", targetColumnId: match[0].id, isDone: match[0].isDone } : list;
    }),
  };
}
export function validateChoice(source: PreviewSource, choice: BoardChoice, options: DestinationOptions): string[] {
  const errors: string[] = [];
  const target = options.boards.find((board) => board.id === choice.targetBoardId);
  if (choice.targetBoardId && !target) errors.push("Quadro de destino indisponível.");
  if (!choice.targetBoardId && (!choice.name.trim() || choice.name.trim().length > 80)) errors.push("Nome do novo quadro deve ter de 1 a 80 caracteres.");
  if (choice.clientId && !target && !options.clients.some((client) => client.id === choice.clientId)) errors.push("Cliente indisponível.");
  if (target && choice.clientId !== (target.clientId ?? "")) errors.push("A prévia deve preservar o cliente do quadro existente.");
  if (choice.lists.length !== source.lists.length || new Set(choice.lists.map((list) => list.sourceListId)).size !== source.lists.length) errors.push("Mapa de listas incompleto ou repetido.");
  for (const sourceList of source.lists) {
    const list = choice.lists.find((list) => list.sourceListId === sourceList.id);
    if (!list) { errors.push(`Defina destino para ${sourceList.name}.`); continue; }
    if (list.archived !== sourceList.closed) errors.push(`${sourceList.name}: preservar arquivo da lista de origem.`);
    if (list.mode === "omit" && sourceList.cards) errors.push(`${sourceList.name}: lista com cards não pode ser omitida.`);
    if (list.mode === "existing" && (sourceList.closed || !target?.columns.some((column) => column.id === list.targetColumnId))) errors.push(`${sourceList.name}: coluna inexistente, de outro quadro ou incompatível com arquivo.`);
    if (list.mode === "existing" && target?.columns.find((column) => column.id === list.targetColumnId)?.isDone !== list.isDone) errors.push(`${sourceList.name}: preservar configuração de conclusão da coluna existente.`);
    if (list.mode === "new" && (!list.name.trim() || list.name.trim().length > 80)) errors.push(`${sourceList.name}: informe um nome de coluna de até 80 caracteres.`);
  }
  for (const [label, mappings, validIds, expected] of [
    ["Pessoa", choice.people, options.users.map((user) => user.id), source.people.map((person) => person.id)],
    ["Etiqueta", choice.labels, [...options.labels.map((item) => item.id), IGNORE_LABEL_TARGET], source.labels.map((item) => item.id)],
  ] as const) {
    if (Object.keys(mappings).length !== expected.length || expected.some((key) => !(key in mappings))) errors.push(`${label}: mapa de origem incompleto.`);
    if (Object.values(mappings).some((value) => value && !validIds.includes(value))) errors.push(`${label}: destino indisponível.`);
  }
  return errors;
}
export function exportPlan(sources: PreviewSource[], choices: BoardChoice[], options: DestinationOptions) {
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error("Quadros de origem repetidos.");
  const cardIds = sources.flatMap((source) => source.cardIds);
  if (new Set(cardIds).size !== cardIds.length) throw new Error("O mesmo card consta em mais de um export. Revise os snapshots.");
  const errors = sources.flatMap((source) => {
    const choice = choices.find((choice) => choice.sourceBoardId === source.id);
    return choice ? validateChoice(source, choice, options).map((error) => `${source.name}: ${error}`) : [`${source.name}: decisões ausentes.`];
  });
  if (choices.length !== sources.length || new Set(choices.map((choice) => choice.sourceBoardId)).size !== sources.length) errors.push("Mapa de quadros incompleto ou repetido.");
  const identities = new Map<string, string>();
  for (const choice of choices) for (const [id, target] of Object.entries(choice.people)) {
    if (identities.has(id) && identities.get(id) !== target) errors.push(`Identidade ${id}: associação diferente entre quadros.`);
    identities.set(id, target);
  }
  return { schemaVersion: 1 as const, kind: "dmanda-trello-preview" as const,
    status: sources.length && !errors.length && choices.every((choice) => choice.reviewed) ? "reviewed" : "draft",
    sources: sources.map(({ id, filename, sha256 }) => ({ id, filename, sha256 })), boards: choices,
    policies: { templates: "preserve_as_templates", archivedLists: "preserve", files: "pending_recovery", notifications: "disabled", ignoredLabelTarget: IGNORE_LABEL_TARGET },
    issues: sources.map((source) => ({ sourceBoardId: source.id, totals: source.totals, issues: source.issues })),
    attachmentReport: sources.flatMap((source) => source.attachments),
    attachmentGaps: sources.map((source) => ({ sourceBoardId: source.id, cards: source.attachmentGaps })),
    errors,
  };
}
export function restorePlan(text: string, sources: PreviewSource[]): BoardChoice[] {
  const result = draftSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new Error("Plano inválido ou versão incompatível.");
  const plan = result.data;
  if (plan.sources.length !== sources.length || plan.boards.length !== sources.length || new Set(plan.sources.map((item) => item.id)).size !== sources.length || new Set(plan.boards.map((item) => item.sourceBoardId)).size !== sources.length) throw new Error("O plano precisa corresponder exatamente aos quadros selecionados.");
  for (const source of sources) {
    if (!plan.sources.some((item) => item.id === source.id && item.sha256 === source.sha256)) throw new Error(`${source.name}: arquivo diferente do plano. Gere uma nova prévia.`);
    const choice = plan.boards.find((item) => item.sourceBoardId === source.id);
    if (!choice) throw new Error("Decisões ausentes no plano.");
    if (choice.lists.length !== source.lists.length || new Set(choice.lists.map((list) => list.sourceListId)).size !== source.lists.length || source.lists.some((list) => !choice.lists.some((item) => item.sourceListId === list.id))) throw new Error(`${source.name}: mapa de listas incompleto ou incompatível.`);
    for (const [mapping, expected] of [[choice.people, source.people.map((person) => person.id)], [choice.labels, source.labels.map((label) => label.id)]] as const) {
      if (Object.keys(mapping).length !== expected.length || expected.some((id) => !Object.hasOwn(mapping, id))) throw new Error(`${source.name}: mapa de pessoas/etiquetas incompatível.`);
    }
  }
  // Uma restauração exige nova revisão, inclusive quando os destinos ainda são válidos.
  return plan.boards.map((choice) => ({ ...choice, reviewed: false }));
}
