"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin, assertUser } from "@/server/auth/current";
import { audit } from "@/server/events";
import { fail, hex, id, run } from "@/server/action";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const clientInput = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(80),
  contact: opt(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || z.string().email().safeParse(v).success, "E-mail inválido."),
  phone: opt(30),
  notes: opt(2000),
  color: hex,
});

export async function createClient(input: z.input<typeof clientInput>) {
  return run(async () => {
    await assertUser();
    const data = clientInput.parse(input);
    const dup = await db.client.findFirst({ where: { name: data.name, active: true }, select: { id: true } });
    if (dup) fail("Já existe um cliente com esse nome.");
    const c = await db.client.create({ data });
    revalidatePath("/", "layout");
    return { id: c.id, name: c.name, color: c.color };
  });
}

export async function updateClient(clientId: string, input: z.input<typeof clientInput>) {
  return run(async () => {
    await assertUser();
    const data = clientInput.parse(input);
    await db.client.update({ where: { id: id.parse(clientId) }, data });
    revalidatePath("/", "layout");
  });
}

/** Arquivar tira o cliente das listas, mas mantém o vínculo nas demandas antigas. */
export async function setClientActive(clientId: string, active: boolean) {
  return run(async () => {
    const user = await assertAdmin();
    const c = await db.client.update({ where: { id: id.parse(clientId) }, data: { active } });
    await audit(user.id, active ? "client.restore" : "client.archive", c.name);
    revalidatePath("/", "layout");
  });
}

export async function deleteClient(clientId: string) {
  return run(async () => {
    const user = await assertAdmin();
    const c = await db.client.findUnique({ where: { id: id.parse(clientId) }, include: { _count: { select: { cards: true } } } });
    if (!c) fail("Cliente não encontrado.");
    if (c._count.cards > 0) fail("Esse cliente tem demandas. Arquive em vez de excluir.");
    await db.client.delete({ where: { id: c.id } });
    await audit(user.id, "client.delete", c.name);
    revalidatePath("/", "layout");
  });
}
