"use server";
import { assertAdmin } from "@/server/auth/current";
import { createClient } from "./clients";
import { createUser } from "./team";

export async function createTrelloClient(input: { name: string; email?: string }) {
  await assertAdmin();
  return createClient({ name: input.name, color: "#19C9A9" });
}
export async function createTrelloUser(input: { name: string; email?: string }) {
  await assertAdmin();
  const result = await createUser({ name: input.name, email: input.email ?? "", role: "MEMBER", color: "#19C9A9" });
  return result.ok ? { ok: true as const, data: { ...result.data, name: input.name.trim() } } : result;
}
