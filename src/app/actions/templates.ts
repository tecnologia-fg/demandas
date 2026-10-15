"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { cleanRich } from "@/server/richtext";
import { fail, id, run } from "@/server/action";
import { PRIORITIES } from "@/lib/domain";

export type TemplateData = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  priority: string | null;
  estimatedMin: number | null;
  checklist: string[];
  labelIds: string[];
};

function parseList(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const templateInput = z.object({
  name: z.string().trim().min(2, "Dê um nome ao modelo.").max(60),
  title: z.string().trim().min(1, "Escreva o título da demanda.").max(200),
  description: z.string().max(100000).nullable().optional(),
  priority: z.enum(PRIORITIES).nullable().optional(),
  estimatedMin: z.number().int().min(0).max(100000).nullable().optional(),
  checklist: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  labelIds: z.array(id).max(30).default([]),
});

export async function listTemplates() {
  return run(async (): Promise<TemplateData[]> => {
    await assertUser();
    const list = await db.cardTemplate.findMany({ orderBy: { name: "asc" }, take: 200 });
    return list.map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimatedMin: t.estimatedMin,
      checklist: parseList(t.checklist),
      labelIds: parseList(t.labelIds),
    }));
  });
}

export async function saveTemplate(templateId: string | null, input: z.input<typeof templateInput>) {
  return run(async () => {
    const user = await assertUser();
    const d = templateInput.parse(input);
    const data = {
      name: d.name,
      title: d.title,
      description: cleanRich(d.description ?? null),
      priority: d.priority ?? null,
      estimatedMin: d.estimatedMin ?? null,
      checklist: JSON.stringify(d.checklist),
      labelIds: JSON.stringify(d.labelIds),
    };
    if (templateId) await db.cardTemplate.update({ where: { id: id.parse(templateId) }, data });
    else await db.cardTemplate.create({ data: { ...data, createdById: user.id } });
  });
}

/** Cria um modelo a partir de uma demanda existente (título, texto, prioridade, etiquetas, itens do checklist). */
export async function templateFromCard(cardId: string, name: string) {
  return run(async () => {
    const user = await assertUser();
    const n = z.string().trim().min(2, "Dê um nome ao modelo.").max(60).parse(name);
    const c = await db.card.findUnique({
      where: { id: id.parse(cardId) },
      include: { labels: true, checklists: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } } },
    });
    if (!c) fail("Demanda não encontrada.");
    await db.cardTemplate.create({
      data: {
        name: n,
        title: c.title,
        description: c.description,
        priority: c.priority,
        estimatedMin: c.estimatedMin,
        checklist: JSON.stringify(c.checklists.flatMap((l) => l.items.map((i) => i.text)).slice(0, 100)),
        labelIds: JSON.stringify(c.labels.map((l) => l.labelId)),
        createdById: user.id,
      },
    });
  });
}

export async function deleteTemplate(templateId: string) {
  return run(async () => {
    await assertUser();
    await db.cardTemplate.delete({ where: { id: id.parse(templateId) } });
  });
}
