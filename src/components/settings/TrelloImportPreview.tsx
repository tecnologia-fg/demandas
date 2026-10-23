"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button, Field, Input } from "@/components/ui/basics";
import { TrelloAttachmentReport, downloadAttachmentCsv } from "./TrelloAttachmentReport";
import { TrelloDestinationCreation, type DestinationCreator } from "./TrelloDestinationCreation";
import { chooseBoard, exportPlan, initialChoice, parseTrello, restorePlan, validateChoice, IGNORE_LABEL_TARGET, type BoardChoice, type DestinationOptions, type PreviewSource } from "@/lib/trello/preview";

const selectClass = "h-10 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-sm text-fg focus:outline-2 focus:outline-accent";
function Select({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  return <Field label={label}><select aria-label={label} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select></Field>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="glass rounded-[24px] p-4 sm:p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>;
}

export function TrelloImportPreview({ options: initialOptions, createDestinations }: { options: DestinationOptions; createDestinations?: { client: DestinationCreator; user: DestinationCreator } }) {
  const [createdClients, setCreatedClients] = useState<DestinationOptions["clients"]>([]);
  const [createdUsers, setCreatedUsers] = useState<DestinationOptions["users"]>([]);
  const options = useMemo(() => ({ ...initialOptions, clients: [...new Map([...initialOptions.clients, ...createdClients].map((item) => [item.id, item])).values()], users: [...new Map([...initialOptions.users, ...createdUsers].map((item) => [item.id, item])).values()] }), [initialOptions, createdClients, createdUsers]);
  const [sources, setSources] = useState<PreviewSource[]>([]);
  const [choices, setChoices] = useState<BoardChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const plan = useMemo(() => exportPlan(sources, choices, options), [sources, choices, options]);
  const source = sources.find((item) => item.id === selected);
  const choice = choices.find((item) => item.sourceBoardId === selected);
  const errors = source && choice ? validateChoice(source, choice, options) : [];
  const targetBoard = options.boards.find((board) => board.id === choice?.targetBoardId);
  const totalCards = sources.reduce((sum, item) => sum + item.totals.cards, 0);

  function update(patch: Partial<BoardChoice>) {
    setChoices((previous) => previous.map((item) => item.sourceBoardId === selected ? { ...item, ...patch, reviewed: false } : item));
    setMessage("");
  }
  async function load(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (files.length > 100 || files.some((file) => file.size > 20 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error("Selecione até 100 arquivos, com até 20 MiB cada e 100 MiB no total.");
      const loaded: PreviewSource[] = [];
      const cardIds = new Set<string>();
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        let parsed: PreviewSource;
        try { parsed = parseTrello(new TextDecoder().decode(bytes), file.name, hash); }
        catch (cause) { throw new Error(`${file.name}: ${cause instanceof Error ? cause.message : "não foi possível analisar o JSON"}`); }
        if (loaded.some((item) => item.id === parsed.id)) throw new Error(`${parsed.name}: quadro repetido. Selecione um único export de cada quadro.`);
        if (parsed.cardIds.some((id) => cardIds.has(id))) throw new Error(`${parsed.name}: um card aparece também em outro export. Revise os snapshots.`);
        parsed.cardIds.forEach((id) => cardIds.add(id));
        loaded.push(parsed);
      }
      setSources(loaded); setChoices(loaded.map((item) => initialChoice(item, options))); setSelected(loaded[0].id);
      setMessage(`${loaded.length} quadros analisados. Revise as decisões de cada quadro.`);
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : "Falha ao analisar os arquivos."} A seleção anterior, se houver, foi preservada.`); }
    finally { setBusy(false); }
  }
  function downloadPlan() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2) + "\n"], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "dmanda-trello-plano.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(plan.status === "reviewed" ? "Plano revisado exportado. Ele registra decisões para o ensaio; ainda não executa a importação." : "Rascunho exportado com as decisões e pendências atuais.");
  }
  async function reopen(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("O plano deve ter até 5 MiB.");
      setChoices(restorePlan(await file.text(), sources));
      setMessage("Plano reaberto. Revise novamente os destinos e as pendências antes de marcar os quadros como revisados.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reabrir o plano."); }
  }

  return <div className="pb-10">
    <PageHeader title="Importar do Trello" subtitle="Prepare os destinos e revise as pendências antes do ensaio de importação." />
    <div className="grid gap-5 px-4 lg:px-6">
      <Section title="1. Selecione os exports">
        <p className="mb-4 text-sm text-fg-2">Selecione os arquivos JSON dos quadros. A análise acontece neste navegador. As escolhas podem ser exportadas para continuar a revisão depois.</p>
        <Field label="Arquivos de quadros Trello" hint="Até 20 MiB por arquivo e 100 MiB por seleção. Uma nova seleção substitui a prévia atual.">
          <input type="file" accept=".json,application/json" multiple disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void load(files); }} className="block w-full rounded-xl bg-surface p-3 text-sm" />
        </Field>
        <p className="mt-3 text-xs text-fg-2">Esta é uma prévia. Nenhum quadro ou card é gravado nesta etapa. Os binários dos anexos serão tratados no ensaio.</p>
      </Section>
      <div aria-live="polite" role="status" className="text-sm text-fg-2">{busy ? "Analisando arquivos…" : message}</div>
      {error ? <p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-danger">{error}</p> : null}
      {sources.length ? <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Quadros", sources.length], ["Cards de origem", totalCards], ["Modelos incluídos", sources.reduce((sum, item) => sum + item.totals.templates, 0)], ["Quadros revisados", choices.filter((item) => item.reviewed).length]].map(([label, value]) => <div key={label} className="glass rounded-2xl p-4"><p className="text-xs text-fg-2">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
          <div className="xl:hidden"><Select label="Quadro em revisão" value={selected} onChange={setSelected}>{sources.map((item) => <option key={item.id} value={item.id}>{item.name} · {choices.find((choice) => choice.sourceBoardId === item.id)?.reviewed ? "Revisado" : "A revisar"}</option>)}</Select></div>
          <nav aria-label="Quadros de origem" className="glass hidden gap-2 rounded-[24px] p-3 xl:grid">
            {sources.map((item) => <button type="button" key={item.id} aria-current={selected === item.id ? "true" : undefined} onClick={() => { setSelected(item.id); setMessage(""); }} className={`rounded-xl p-3 text-left text-sm ${selected === item.id ? "bg-panel text-panel-fg" : "hover:bg-surface"}`}>
              <span className="block font-medium">{item.name}</span><span className="text-xs opacity-75">{item.totals.cards} cards · {choices.find((choice) => choice.sourceBoardId === item.id)?.reviewed ? "Revisado" : "A revisar"}</span>
            </button>)}
          </nav>
          {source && choice ? <div className="grid min-w-0 gap-5">
            <Section title={`2. Destino de ${source.name}`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Quadro de destino" value={choice.targetBoardId} onChange={(value) => setChoices((previous) => previous.map((item) => item.sourceBoardId === source.id ? chooseBoard(source, item, value, options) : item))}>
                  <option value="">Criar novo quadro</option>{options.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                </Select>
                <Field label="Nome do novo quadro"><Input value={choice.name} disabled={Boolean(choice.targetBoardId)} maxLength={80} onChange={(event) => update({ name: event.target.value })} /></Field>
                <Select label="Cliente do quadro" value={choice.clientId} disabled={Boolean(targetBoard)} onChange={(value) => update({ clientId: value })}>
                  {targetBoard?.clientId && !options.clients.some((client) => client.id === targetBoard.clientId) ? <option value={targetBoard.clientId}>Cliente atual do quadro (inativo)</option> : null}
                  <option value="">Sem cliente associado</option>{options.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </Select>
                <Select label="Conclusão dos cards importados" value={choice.completion} onChange={(value) => update({ completion: value as BoardChoice["completion"] })}>
                  <option value="preserve">Preservar marca de conclusão do Trello</option><option value="column">Alinhar à coluna de destino</option>
                </Select>
              </div>
              {createDestinations && !targetBoard && <TrelloDestinationCreation key={`client:${source.id}`} kind="client" initialName={source.name} create={createDestinations.client} onCreated={(client) => { setCreatedClients((previous) => [...previous, client]); update({ clientId: client.id }); }} />}
              <p className="mt-4 text-xs text-fg-2">Trocar o quadro de destino refaz as sugestões de colunas. Modelos serão preservados como modelos. Listas e cards arquivados conservarão seu estado. {source.closed ? "O quadro de origem está arquivado; seu estado deve ser preservado no ensaio." : ""} Os destinos de aprovação serão configurados no ensaio antes de ativar o portal.</p>
              <details className="mt-3 text-xs text-fg-2"><summary className="cursor-pointer">Arquivo de origem e integridade</summary><p className="mt-2 break-all">{source.filename}</p><p className="mt-1 break-all">SHA-256: {source.sha256}</p></details>
            </Section>
            <Section title="3. Relacione as colunas">
              <p className="mb-4 text-sm text-fg-2">Planejamento sugere Caixa de entrada. Várias listas podem usar a mesma coluna existente; os cards novos serão anexados na ordem das listas de origem. Colunas novas com o mesmo nome permanecem distintas.</p>
              <div className="grid gap-4">
                {source.lists.map((list) => {
                  const mapping = choice.lists.find((item) => item.sourceListId === list.id)!;
                  function patchList(patch: Partial<typeof mapping>) { update({ lists: choice!.lists.map((item) => item.sourceListId === list.id ? { ...item, ...patch } : item) }); }
                  return <div key={list.id} className="rounded-2xl bg-surface-2 p-4">
                    <div className="mb-3"><h3 className="text-sm font-semibold">{list.name}</h3><p className="text-xs text-fg-2">{list.cards} cards · {list.templates} modelos{list.closed ? " · Lista arquivada" : ""}</p></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select label={`Destino de ${list.name}`} value={mapping.mode === "existing" ? mapping.targetColumnId : mapping.mode} onChange={(value) => {
                        const column = targetBoard?.columns.find((column) => column.id === value);
                        patchList(column ? { mode: "existing", targetColumnId: column.id, isDone: column.isDone } : { mode: value as "new" | "omit", targetColumnId: "" });
                      }}>
                        <option value="new">Criar coluna{list.closed ? " arquivada" : ""}</option>
                        {!list.cards ? <option value="omit">Somente registrar origem (lista vazia)</option> : null}
                        {!list.closed ? targetBoard?.columns.map((column) => <option key={column.id} value={column.id}>{column.name}{column.isDone ? " · Concluídas" : ""}</option>) : null}
                      </Select>
                      {mapping.mode === "new" ? <Field label={`Nome da coluna para ${list.name}`}><Input value={mapping.name} maxLength={80} onChange={(event) => patchList({ name: event.target.value })} /></Field> : null}
                    </div>
                    {mapping.mode === "new" ? <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={mapping.isDone} onChange={(event) => patchList({ isDone: event.target.checked })} />Coluna de demandas concluídas</label> : null}
                    {list.samples.length ? <details className="mt-3 text-xs text-fg-2"><summary className="cursor-pointer">Exemplos de cards da origem</summary><ul className="mt-2 grid list-inside list-disc gap-1">{list.samples.map((title, index) => <li key={index}>{title}</li>)}</ul></details> : null}
                  </div>;
                })}
              </div>
            </Section>
            <Section title="4. Pessoas e etiquetas">
              <details><summary className="cursor-pointer text-sm font-medium">Pessoas: {source.people.length} identidades de origem</summary>
                <p className="my-3 text-xs text-fg-2">A opção de identidade externa conserva a autoria original sem criar uma conta. Responsabilidades sem usuário associado permanecerão pendentes para o ensaio. A associação pelo mesmo ID é compartilhada entre os quadros selecionados.</p>
                <div className="grid gap-3 sm:grid-cols-2">{source.people.map((person) => <div key={person.id}><Select label={`${person.name} (${person.id.slice(-6)})`} value={choice.people[person.id] ?? ""} onChange={(value) => setChoices((previous) => previous.map((item) => person.id in item.people ? { ...item, people: { ...item.people, [person.id]: value }, reviewed: false } : item))}>
                  <option value="">Preservar identidade externa</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </Select>{createDestinations && <TrelloDestinationCreation kind="user" associated={Boolean(choice.people[person.id])} initialName={person.name} create={createDestinations.user} onCreated={(user) => { setCreatedUsers((previous) => [...previous, user]); setChoices((previous) => previous.map((item) => person.id in item.people ? { ...item, people: { ...item.people, [person.id]: user.id }, reviewed: false } : item)); }} />}</div>)}</div>
              </details>
              <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Etiquetas: {source.labels.length} definições</summary>
                <p className="my-3 text-xs text-fg-2">Associe várias etiquetas de origem à mesma etiqueta do Dmanda para juntá-las. Ou ignore a etiqueta para não aplicá-la aos cards. Cores e nomes originais ficam preservados no registro do lote.</p>
                <div className="grid gap-3 sm:grid-cols-2">{source.labels.map((label) => <Select key={label.id} label={`${label.name || "Sem nome"} · ${label.color || "sem cor"}`} value={choice.labels[label.id] ?? ""} onChange={(value) => update({ labels: { ...choice.labels, [label.id]: value } })}>
                  <option value="">Criar etiqueta preservando origem</option><option value={IGNORE_LABEL_TARGET}>Ignorar — deixar sem esta etiqueta</option>{options.labels.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.color}</option>)}
                </Select>)}</div>
              </details>
            </Section>
            <Section title="5. Pendências e revisão">
              <p className="mb-3 text-sm text-fg-2">{source.totals.archived} cards arquivados · {source.totals.attachments} referências de anexos · {source.totals.comments} comentários disponíveis · {source.totals.checklists} checklists / {source.totals.checklistItems} itens</p>
              <ul className="grid gap-2 text-sm">{source.issues.map((issue) => <li key={issue.code} className="rounded-xl bg-surface-2 p-3"><span className="font-semibold">{issue.count}</span> · {issue.message}</li>)}</ul>
              <p className="mt-4 text-xs text-fg-2">Tipo de entrega e Pasta do Drive serão preservados com os valores originais. A padronização do catálogo e a recuperação de arquivos/comentários serão validadas no ensaio.</p>
              <TrelloAttachmentReport key={source.id} source={source} />
              {errors.length ? <div role="alert" className="mt-4 text-sm text-danger"><p className="font-semibold">Decisões a corrigir:</p><ul className="mt-2 list-inside list-disc">{errors.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
              <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={choice.reviewed} disabled={Boolean(errors.length)} onChange={(event) => setChoices((previous) => previous.map((item) => item.sourceBoardId === selected ? { ...item, reviewed: event.target.checked } : item))} className="mt-1" />Revisei os destinos e as pendências deste quadro. A execução será tratada no ensaio.</label>
            </Section>
          </div> : null}
        </div>
        <Section title="6. Salve o plano para revisão">
          <p className="mb-4 text-sm text-fg-2">{plan.status === "reviewed" ? "Todos os quadros foram revisados. O plano está preparado para discutir o ensaio." : "Você pode exportar um rascunho a qualquer momento e continuar depois."} O arquivo contém nomes e IDs reais; guarde-o em local privado.</p>
          {plan.errors.length ? <details className="mb-4 text-sm text-danger"><summary className="cursor-pointer">{plan.errors.length} decisões a corrigir no conjunto</summary><ul className="mt-2 list-inside list-disc">{plan.errors.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" variant="dark" onClick={downloadPlan} disabled={busy}>{plan.status === "reviewed" ? "Exportar plano revisado" : "Exportar rascunho"}</Button>
            <Button type="button" disabled={busy} onClick={() => downloadAttachmentCsv(plan.attachmentReport)}>CSV de anexos de todos os quadros</Button>
            <Field label="Reabrir plano salvo"><input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void reopen(file); }} className="max-w-full text-sm" /></Field>
          </div>
        </Section>
      </> : null}
    </div>
  </div>;
}
