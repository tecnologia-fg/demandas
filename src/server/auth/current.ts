import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { readSession } from "./session";

// Relê o usuário no banco a cada request (deduplicado por React cache): conta desativada
// ou senha trocada derruba a sessão na hora, sem esperar o cookie expirar.
const loadCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, color: true, accentColor: true, avatarUrl: true, glassLevel: true, active: true, mustChangePassword: true, sessionsValidFrom: true },
  });
  if (!user || !user.active) return null;
  // iat em segundos; tolera 1s de arredondamento
  if (session.iat * 1000 < user.sessionsValidFrom.getTime() - 1000) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, color: user.color, accentColor: user.accentColor, avatarUrl: user.avatarUrl, glassLevel: user.glassLevel, mustChangePassword: user.mustChangePassword, isAdmin: user.role === "ADMIN" };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadCurrentUser>>>;

export async function getCurrentUser() {
  return loadCurrentUser();
}

/** Para páginas. */
export async function requireUser() {
  const user = await loadCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/trocar-senha");
  return user;
}

export async function requireAdminPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/** Para server actions e route handlers: lança erro em vez de redirecionar. */
export async function assertUser() {
  const user = await loadCurrentUser();
  if (!user) throw new ActionError("Sessão expirada. Entre novamente.");
  if (user.mustChangePassword) throw new ActionError("Troque sua senha antes de continuar.");
  return user;
}

export async function assertAdmin() {
  const user = await assertUser();
  if (!user.isAdmin) throw new ActionError("Só administradores podem fazer isso.");
  return user;
}

export class ActionError extends Error {}
