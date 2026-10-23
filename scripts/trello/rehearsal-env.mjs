import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const directory = "research/trello/local/rehearsal";
await mkdir(directory, { recursive: true });
const filename = `${directory}/.env`;
try { await readFile(filename); console.log("Configuração isolada existente preservada."); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const password = randomBytes(24).toString("hex");
  const url = `postgresql://dmanda_rehearsal:${password}@db:5432/dmanda_trello_rehearsal?schema=public`;
  await writeFile(filename, ["POSTGRES_USER=dmanda_rehearsal", "POSTGRES_DB=dmanda_trello_rehearsal", `POSTGRES_PASSWORD=${password}`,
    `DATABASE_URL=${url}`, `DIRECT_URL=${url}`, `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    "TRELLO_REHEARSAL=1", "REHEARSAL_ADMIN_EMAIL=ensaio@dmanda.local", `REHEARSAL_ADMIN_PASSWORD=${randomBytes(15).toString("base64url")}`,
    "APP_URL=http://localhost:3100", "TZ=America/Sao_Paulo", "NEXT_TELEMETRY_DISABLED=1", ""].join("\n"), { flag: "wx" });
  console.log("Configuração isolada criada em research/trello/local/rehearsal/.env (privada).");
}
