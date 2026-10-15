"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { createSession, destroySession } from "@/server/auth/session";
import { getCurrentUser } from "@/server/auth/current";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { clearHits, clientIp, hit, isLimited, rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/events";
import { DEMO_EMAIL_SUFFIX, SETUP_KEY } from "@/server/setup";

// hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quem tem conta)
const DUMMY_HASH = hashPassword("nao-existe-esta-senha");

type FormState = { error?: string; values?: Record<string, string> } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? "").slice(0, 200) };
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "Informe e-mail e senha.", values };
  const { email, password } = parsed.data;
  const ip = await clientIp();
  // só as tentativas ERRADAS contam (8 por e-mail e 30 por IP a cada 15 min); entrar certo não gasta o limite
  const WINDOW = 15 * 60_000;
  const byIp = isLimited(`login-ip:${ip}`, 30, WINDOW);
  const byEmail = isLimited(`login-email:${email}`, 8, WINDOW);
  if (byIp.limited || byEmail.limited) {
    const minutes = Math.ceil(Math.max(byIp.retryInMs, byEmail.retryInMs) / 60_000);
    return { error: `Muitas tentativas. Tente de novo em ${minutes} min.`, values };
  }
  const user = await db.user.findUnique({ where: { email } });
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    hit(`login-ip:${ip}`);
    hit(`login-email:${email}`);
    if (user) await audit(user.id, "login.fail", ip);
    return { error: "E-mail ou senha incorretos.", values };
  }
  clearHits(`login-email:${email}`);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  const next = String(form.get("next") ?? "");
  redirect(user.mustChangePassword ? "/trocar-senha" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!rateLimit(`pwd:${user.id}`, 10, 15 * 60_000).ok) return { error: "Muitas tentativas. Espere alguns minutos." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next.length < 8) return { error: "A nova senha precisa de pelo menos 8 caracteres." };
  if (next.length > 200) return { error: "Senha longa demais." };
  if (next !== confirm) return { error: "A confirmação não bate com a nova senha." };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!verifyPassword(current, row.passwordHash)) return { error: "Senha atual incorreta." };
  if (current === next) return { error: "Escolha uma senha diferente da atual." };
  // derruba as outras sessões e emite uma nova para quem trocou
  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next), mustChangePassword: false, sessionsValidFrom: new Date() } });
  await createSession(user.id);
  await audit(user.id, "password.change");
  redirect("/");
}

const firstAccessInput = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(200),
  confirm: z.string(),
  disableDemo: z.boolean(),
});

/**
 * Primeiro acesso: cria a conta de dono (ADMIN) e fecha o cadastro para sempre. Uso único, garantido dentro
 * da transação (se duas pessoas tentarem ao mesmo tempo, só a primeira grava a chave SETUP_KEY).
 */
export async function firstAccess(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: String(form.get("name") ?? "").slice(0, 80), email: String(form.get("email") ?? "").slice(0, 200) };
  const ip = await clientIp();
  if (!rateLimit(`setup:${ip}`, 10, 15 * 60_000).ok) return { error: "Muitas tentativas. Espere alguns minutos.", values };
  const parsed = firstAccessInput.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
    confirm: form.get("confirm"),
    disableDemo: form.get("disableDemo") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Confira os dados.", values };
  const { name, email, password, confirm, disableDemo } = parsed.data;
  if (password !== confirm) return { error: "A confirmação não bate com a senha.", values };
  if (email.endsWith(DEMO_EMAIL_SUFFIX)) return { error: "Use o seu e-mail de verdade, não um de demonstração.", values };

  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      if (await tx.appSetting.findUnique({ where: { key: SETUP_KEY } })) throw new Error("FECHADO");
      if (await tx.user.findUnique({ where: { email } })) throw new Error("EMAIL");
      await tx.appSetting.create({ data: { key: SETUP_KEY, value: new Date().toISOString() } });
      const u = await tx.user.create({
        data: { name, email, role: "ADMIN", color: "#0B9A82", passwordHash: hashPassword(password), lastLoginAt: new Date() },
      });
      const boards = await tx.board.findMany({ where: { archivedAt: null }, select: { id: true }, take: 50 });
      if (boards.length) await tx.boardFavorite.createMany({ data: boards.map((b) => ({ userId: u.id, boardId: b.id })) });
      if (disableDemo) {
        await tx.user.updateMany({ where: { email: { endsWith: DEMO_EMAIL_SUFFIX } }, data: { active: false, sessionsValidFrom: new Date() } });
      }
      return u.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "FECHADO") return { error: "O primeiro acesso já foi feito. Entre com sua conta." };
    if (msg === "EMAIL") return { error: "Já existe uma conta com esse e-mail.", values };
    console.error("[primeiro-acesso]", err);
    return { error: "Não deu certo agora. Tente de novo.", values };
  }
  await audit(userId, "setup.complete", `${email}${disableDemo ? " (contas de exemplo desativadas)" : ""}`);
  await createSession(userId);
  redirect("/");
}
