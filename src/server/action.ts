import "server-only";
import { z } from "zod";
import { ActionError } from "./auth/current";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Embrulha uma server action: valida a entrada com zod e transforma erros em mensagem amigável. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
    console.error("[acao]", err);
    return { ok: false, error: "Não deu certo agora. Tente de novo." };
  }
}

export function fail(message: string): never {
  throw new ActionError(message);
}

export const id = z.string().min(1).max(40);
export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
