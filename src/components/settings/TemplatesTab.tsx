"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRIORITIES, PRIORITY_META, type Priority } from "@/lib/domain";
import { formatMinutes } from "@/lib/dates";
import { Button, EmptyState, Field, Input, LabelChip, Textarea } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { RichEditor } from "@/components/editor/RichEditor";
import { PriorityIcon } from "@/components/board/pickers";
import { deleteTemplate, listTemplates, saveTemplate, type TemplateData } from "@/app/actions/templates";
import { deleteBoardTemplate, listBoardTemplates } from "@/app/actions/boards";

type Label = { id: string; name: string; color: string };

export function TemplatesTab({ labels }: { labels: Label[] }) {
  return (
    <div className="grid gap-4">
      <CardTemplates labels={labels} />
      <BoardTemplates />
    </div>
  );
}

function BoardTemplates() {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<{ id: string; name: string; columns: string[]; cardCount: number }[] | null>(null);
  useEffect(() => {
    listBoardTemplates().then((res) => (res.ok ? setItems(res.data) : toast(res.error, "error")));
  }, [toast]);
  return (
    <section className="glass grid gap-2 rounded-[26px] p-4 sm:p-5">
      <div className="pb-2">
        <h2 className="text-lg font-semibold">Modelos de quadro</h2>
        <p className="text-sm text-fg-2">Salve um quadro pronto pelo menu dele (Salvar como modelo de quadro) e use em Novo quadro.</p>
      </div>
      {items?.length === 0 && <p className="text-sm text-fg-3">Nenhum modelo de quadro ainda.</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items?.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-2xl bg-card p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{t.name}</p>
              <p className="line-clamp-2 text-sm text-fg-2">{t.columns.join(", ")}</p>
              {t.cardCount > 0 && <p className="text-xs text-fg-3">{t.cardCount} demandas de partida</p>}
            </div>
            <button
              type="button"
              aria-label={`Excluir ${t.name}`}
              onClick={async () => {
                if (!(await confirm({ title: `Excluir o modelo "${t.name}"?`, text: "Os quadros já criados com ele não mudam.", confirm: "Excluir", danger: true }))) return;
                const res = await deleteBoardTemplate(t.id);
                if (!res.ok) return toast(res.error, "error");
                setItems((all) => all?.filter((x) => x.id !== t.id) ?? null);
              }}
              className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardTemplates({ labels }: { labels: Label[] }) {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<TemplateData[] | null>(null);
  const [editing, setEditing] = useState<TemplateData | "new" | null>(null);
  const reload = () => listTemplates().then((res) => (res.ok ? setItems(res.data) : toast(res.error, "error")));
  useEffect(() => {
    listTemplates().then((res) => (res.ok ? setItems(res.data) : toast(res.error, "error")));
  }, [toast]);
  const labelById = new Map(labels.map((l) => [l.id, l]));

  return (
    <section className="glass grid gap-2 rounded-[26px] p-4 sm:p-5">
      <div className="flex items-center gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Modelos de demanda</h2>
          <p className="text-sm text-fg-2">Demandas que se repetem já nascem com texto, etiquetas e checklist. Use em Nova demanda.</p>
        </div>
        <Button variant="dark" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Novo modelo
        </Button>
      </div>
      {items === null && <p className="py-6 text-center text-sm text-fg-3">Carregando...</p>}
      {items?.length === 0 && (
        <EmptyState icon={<LayoutTemplate className="size-5" />} title="Nenhum modelo ainda" text="Crie aqui ou abra uma demanda pronta e use “Salvar como modelo” no menu dela." />
      )}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items?.map((t) => (
          <div key={t.id} className="grid gap-2.5 rounded-2xl bg-card p-4 shadow-sm">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{t.name}</p>
                <p className="truncate text-sm text-fg-2">{t.title}</p>
              </div>
              <button type="button" aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"><Pencil className="size-3.5" /></button>
              <button
                type="button"
                aria-label={`Excluir ${t.name}`}
                onClick={async () => {
                  if (!(await confirm({ title: `Excluir o modelo "${t.name}"?`, text: "As demandas já criadas com ele não mudam.", confirm: "Excluir", danger: true }))) return;
                  const res = await deleteTemplate(t.id);
                  if (!res.ok) return toast(res.error, "error");
                  setItems((all) => all?.filter((x) => x.id !== t.id) ?? null);
                }}
                className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {t.priority && <PriorityIcon priority={t.priority} size={20} />}
              {t.checklist.length > 0 && (
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11.5px] font-medium text-fg-2">
                  <ListChecks className="size-3.5" /> {t.checklist.length} itens
                </span>
              )}
              {t.estimatedMin ? <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2 text-[11.5px] font-medium text-fg-2">{formatMinutes(t.estimatedMin)}</span> : null}
              {t.labelIds.map((id) => labelById.get(id)).filter(Boolean).map((l) => <LabelChip key={l!.id} name={l!.name} color={l!.color} size="xs" />)}
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <TemplateForm
          template={editing === "new" ? null : editing}
          labels={labels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function TemplateForm({ template, labels, onClose, onSaved }: { template: TemplateData | null; labels: Label[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [priority, setPriority] = useState<Priority | null>((template?.priority as Priority) ?? null);
  const [estimate, setEstimate] = useState(template?.estimatedMin ? String(template.estimatedMin) : "");
  const [checklist, setChecklist] = useState((template?.checklist ?? []).join("\n"));
  const [labelIds, setLabelIds] = useState<string[]>(template?.labelIds ?? []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = await saveTemplate(template?.id ?? null, {
      name,
      title,
      description: description || null,
      priority,
      estimatedMin: estimate ? Math.max(0, Math.round(Number(estimate))) || null : null,
      checklist: checklist.split("\n").map((l) => l.trim()).filter(Boolean),
      labelIds,
    });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Modelo salvo");
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? "Editar modelo" : "Novo modelo"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={name.trim().length < 2 || !title.trim()}>Salvar modelo</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do modelo">
            <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Post de feed" />
          </Field>
          <Field label="Título da demanda">
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Post de feed: tema" />
          </Field>
        </div>
        <Field group label="Descrição">
          <RichEditor value={description} onChange={setDescription} minHeight={110} placeholder="Briefing padrão, links úteis..." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field group label="Prioridade">
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button key={p} type="button" onClick={() => setPriority(priority === p ? null : p)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[13px] font-medium", priority === p ? "bg-panel text-panel-fg" : "bg-surface-2 text-fg-2")}>
                  <PriorityIcon priority={p} size={20} /> {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Estimativa (minutos)">
            <Input type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="Ex.: 60" />
          </Field>
        </div>
        <Field label="Checklist" hint="Um item por linha.">
          <Textarea rows={5} value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Briefing aprovado\nArte\nLegenda\nAprovação do cliente"} />
        </Field>
        {labels.length > 0 && (
          <Field group label="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <button key={l.id} type="button" aria-pressed={labelIds.includes(l.id)} onClick={() => setLabelIds((a) => (a.includes(l.id) ? a.filter((x) => x !== l.id) : [...a, l.id]))} className={cn("rounded-full transition", labelIds.includes(l.id) ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : "opacity-60 hover:opacity-100")}>
                  <LabelChip name={l.name} color={l.color} />
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
