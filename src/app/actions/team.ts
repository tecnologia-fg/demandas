"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin, assertUser } from "@/server/auth/current";
import { hashPassword, temporaryPassword } from "@/server/auth/password";
import { audit } from "@/server/events";
import { fail, hex, id, run } from "@/server/action";

const userInput = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  role: z.enum(["ADMIN", "MEMBER"]),
  color: hex,
});

export async function createUser(input: z.input<typeof userInput>) {
  return run(async () => {
    const admin = await assertAdmin();
    const data = userInput.parse(input);
    if (await db.user.findUnique({ where: { email: data.email } })) fail("Já existe alguém com esse e-mail.");
    const password = temporaryPassword();
    const u = await db.user.create({ data: { ...data, passwordHash: hashPassword(password), mustChangePassword: true } });
    await audit(admin.id, "user.create", `${u.email} (${u.role})`);
    revalidatePath("/configuracoes");
    return { id: u.id, password };
  });
}

export async function updateUser(userId: string, input: Partial<z.input<typeof userInput>> & { active?: boolean }) {
  return run(async () => {
    const admin = await assertAdmin();
    const data = userInput.partial().extend({ active: z.boolean().optional() }).parse(input);
    const target = await db.user.findUnique({ where: { id: id.parse(userId) } });
    if (!target) fail("Pessoa não encontrada.");
    if (data.email && data.email !== target.email && (await db.user.findUnique({ where: { email: data.email } }))) fail("Já existe alguém com esse e-mail.");
    const losingAdmin = target.role === "ADMIN" && ((data.role && data.role !== "ADMIN") || data.active === false);
    if (losingAdmin) {
      const admins = await db.user.count({ where: { role: "ADMIN", active: true } });
      if (admins <= 1) fail("A equipe precisa de pelo menos um administrador ativo.");
    }
    await db.user.update({
      where: { id: target.id },
      data: { ...data, ...(data.active === false || data.role ? { sessionsValidFrom: new Date() } : {}) },
    });
    await audit(admin.id, "user.update", `${target.email}: ${JSON.stringify(data)}`);
    revalidatePath("/configuracoes");
  });
}

export async function resetUserPassword(userId: string) {
  return run(async () => {
    const admin = await assertAdmin();
    const target = await db.user.findUnique({ where: { id: id.parse(userId) } });
    if (!target) fail("Pessoa não encontrada.");
    const password = temporaryPassword();
    await db.user.update({ where: { id: target.id }, data: { passwordHash: hashPassword(password), mustChangePassword: true, sessionsValidFrom: new Date() } });
    await audit(admin.id, "user.reset_password", target.email);
    return password;
  });
}

// ---------- Etiquetas (qualquer pessoa da equipe cria; excluir é do admin) ----------

const labelInput = z.object({ name: z.string().trim().min(1, "Dê um nome à etiqueta.").max(40), color: hex });

export async function createLabel(input: z.input<typeof labelInput>) {
  return run(async () => {
    await assertUser();
    const data = labelInput.parse(input);
    const last = await db.label.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const l = await db.label.create({ data: { ...data, position: (last?.position ?? -1) + 1 } });
    revalidatePath("/", "layout");
    return { id: l.id, name: l.name, color: l.color };
  });
}

export async function updateLabel(labelId: string, input: z.input<typeof labelInput>) {
  return run(async () => {
    await assertUser();
    const data = labelInput.parse(input);
    await db.label.update({ where: { id: id.parse(labelId) }, data });
    revalidatePath("/", "layout");
  });
}

export async function deleteLabel(labelId: string) {
  return run(async () => {
    const admin = await assertAdmin();
    const l = await db.label.delete({ where: { id: id.parse(labelId) } });
    await audit(admin.id, "label.delete", l.name);
    revalidatePath("/", "layout");
  });
}

// ---------- Perfil ----------

export async function updateProfile(input: { name: string; color: string }) {
  return run(async () => {
    const user = await assertUser();
    const data = z.object({ name: z.string().trim().min(2, "Informe seu nome.").max(80), color: hex }).parse(input);
    await db.user.update({ where: { id: user.id }, data });
    revalidatePath("/", "layout");
  });
}

/** Cor do sistema da própria pessoa (null volta ao verde-água padrão). */
export async function setAccentColor(color: string | null) {
  return run(async () => {
    const user = await assertUser();
    const value = color === null ? null : hex.parse(color);
    await db.user.update({ where: { id: user.id }, data: { accentColor: value } });
    revalidatePath("/", "layout");
  });
}

/** Intensidade do vidro da interface (0 = liso, 100 = vidro máximo), da própria pessoa. */
export async function setGlassLevel(level: number) {
  return run(async () => {
    const user = await assertUser();
    const value = z.number().int().min(0).max(100).parse(Math.round(level));
    await db.user.update({ where: { id: user.id }, data: { glassLevel: value } });
  });
}
