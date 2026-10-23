"use client";
import { useMemo, useState } from "react";
import { applyTrelloLabelReview, undoTrelloLabelReview, exportTrelloLabelAssociations } from "@/app/actions/trello-label-review";
import { Button, Field, Input } from "@/components/ui/basics";
import { labelNameKey, type LabelDecision, type LabelReviewGroup, type ReviewLabel } from "@/lib/trello/label-review";

export function TrelloLabelReview({ groups, labels, fingerprint, latestReview }: { groups: LabelReviewGroup[]; labels: ReviewLabel[]; fingerprint: string; latestReview: string | null }) {
  const [choices, setChoices] = useState<Record<string, LabelDecision>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previousFingerprint, setPreviousFingerprint] = useState(fingerprint);
  if (previousFingerprint !== fingerprint) { setPreviousFingerprint(fingerprint); setChoices({}); }
  const catalog = useMemo(() => [...labels].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.color.localeCompare(b.color)), [labels]);
  const choice = (group: LabelReviewGroup): LabelDecision => choices[group.key] ?? { group: group.key, mode: "keep", targetId: "", name: group.name, color: "#19C9A9" };
  const update = (group: LabelReviewGroup, patch: Partial<LabelDecision>) => setChoices((previous) => ({ ...previous, [group.key]: { ...choice(group), ...patch } }));
  const selected = Object.values(choices).filter((decision) => decision.mode !== "keep");
  const visible = groups.filter((group) => labelNameKey(group.name).includes(labelNameKey(query)));
  async function apply() {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const result = await applyTrelloLabelReview({ fingerprint, decisions: selected });
      if (!result.ok) { setError(result.error); return; }
      setChoices({}); setMessage(`Revisão aplicada em ${result.data.cards} cards. ${result.data.labelsRemoved} etiquetas importadas sem uso foram removidas do catálogo.`);
    } catch { setError("Não foi possível concluir. Recarregue para conferir o estado antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  async function undo() {
    if (busy || !latestReview) return; setBusy(true); setError("");
    try {
      const result = await undoTrelloLabelReview(latestReview);
      if (!result.ok) { setError(result.error); return; }
      setChoices({}); setMessage("Última revisão desfeita. As associações anteriores foram restauradas.");
    } catch { setError("Não foi possível desfazer. Recarregue para conferir as associações."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const result = await exportTrelloLabelAssociations();
      if (!result.ok) { setError(result.error); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "dmanda-trello-etiquetas.json"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("Não foi possível exportar o mapa."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:p-6">
    <div><h1 className="text-2xl font-semibold">Revisar etiquetas do Trello</h1><p className="mt-2 text-sm text-fg-2">{groups.reduce((sum, group) => sum + group.sourceIds.length, 0)} definições de origem em {groups.length} grupos para revisar. {labels.length} etiquetas no catálogo do Dmanda.</p></div>
    <p className="text-sm text-fg-2">Várias etiquetas podem apontar para a mesma etiqueta do Dmanda. Ignorar retira a associação dos cards importados; o dado original do Trello fica preservado. Outras etiquetas adicionadas aos cards são mantidas. Etiquetas importadas que ficarem sem uso poderão sair do catálogo.</p>
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Buscar etiqueta"><Input value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
      <Button disabled={busy} onClick={() => { const next = { ...choices }; for (const group of groups) { const matches = labels.filter((label) => labelNameKey(label.name) === labelNameKey(group.name)); if (matches.length === 1) next[group.key] = { ...choice(group), mode: "existing", targetId: matches[0].id }; } setChoices(next); }}>Sugerir associações por nome</Button>
      <Button disabled={busy} onClick={() => { const next = { ...choices }; for (const group of groups.filter((group) => group.key.startsWith("unnamed:"))) next[group.key] = { ...choice(group), mode: "ignore" }; setChoices(next); }}>Ignorar etiquetas sem nome</Button>
      <Button disabled={busy} onClick={() => setChoices({})}>Limpar escolhas</Button>
      <Button disabled={busy || Boolean(selected.length)} onClick={() => void download()}>Exportar associações aplicadas</Button>
    </div>
    <div role="status" className="text-sm">{message}</div>{error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="grid gap-3">{visible.map((group) => {
      const decision = choice(group);
      const current = group.targets.map((id) => labels.find((label) => label.id === id)?.name ?? "Indisponível");
      return <section key={group.key} aria-label={`Etiqueta ${group.name}`} className="glass grid gap-3 rounded-2xl p-4">
        <div><h2 className="font-semibold">{group.name}</h2><p className="mt-1 text-xs text-fg-2">{group.sourceIds.length} definições · {group.boards} quadros · {group.cards} cards · Cores de origem: {group.colors.join(", ")}</p><p className="mt-1 text-xs text-fg-2">Destino atual: {current.length ? [...new Set(current)].join(", ") : "Sem associação"}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Ação para ${group.name}`}><select aria-label={`Ação para ${group.name}`} className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" value={decision.mode} disabled={busy} onChange={(event) => update(group, { mode: event.target.value as LabelDecision["mode"] })}>
            <option value="keep">Manter como está</option><option value="existing">Associar / juntar com etiqueta do Dmanda</option><option value="new">Criar uma única etiqueta nova para este grupo</option><option value="ignore">Ignorar — deixar sem esta etiqueta</option>
          </select></Field>
          {decision.mode === "existing" && <Field label={`Destino para ${group.name}`}><select aria-label={`Destino para ${group.name}`} className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" disabled={busy} value={decision.targetId} onChange={(event) => update(group, { targetId: event.target.value })}><option value="">Escolha uma etiqueta</option>{catalog.map((label) => <option key={label.id} value={label.id}>{label.name} · {label.color}</option>)}</select></Field>}
          {decision.mode === "new" && <><Field label={`Novo nome para ${group.name}`}><Input maxLength={40} disabled={busy} value={decision.name} onChange={(event) => update(group, { name: event.target.value })} /></Field><Field label={`Cor para ${group.name}`}><input type="color" disabled={busy} value={decision.color} onChange={(event) => update(group, { color: event.target.value })} /></Field></>}
        </div>
      </section>;
    })}</div>
    <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lg">
      <p className="mr-auto text-sm">{selected.length} grupos com mudança. As escolhas só alteram os cards ao aplicar.</p>
      {latestReview && <Button disabled={busy} onClick={() => void undo()}>Desfazer última revisão</Button>}
      <Button variant="dark" disabled={busy || !selected.length || selected.some((item) => item.mode === "existing" && !item.targetId || item.mode === "new" && !item.name.trim())} onClick={() => void apply()}>{busy ? "Processando…" : "Aplicar revisão de etiquetas"}</Button>
    </div>
  </div>;
}
