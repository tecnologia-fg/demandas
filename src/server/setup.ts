import "server-only";
import { db } from "./db";

export const SETUP_KEY = "setupCompletedAt";
/** Contas criadas pelo seed de demonstração. */
export const DEMO_EMAIL_SUFFIX = "@demanda.local";

/** O primeiro acesso fica disponível até alguém criar a conta de dono por ele (uso único). */
export async function isSetupOpen() {
  const done = await db.appSetting.findUnique({ where: { key: SETUP_KEY } });
  return !done;
}
