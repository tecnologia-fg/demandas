import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
let url;
try { url = new URL(process.env.DATABASE_URL); if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error(); }
catch { console.log(JSON.stringify({ status: "INVALID_DATABASE_URL" })); process.exit(1); }
const host = url.hostname, port = Number(url.port || 5432);
try {
  const result = await lookup(host);
  const tcp = await new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(5000);
    socket.once("connect", () => { socket.destroy(); resolve("reachable"); });
    socket.once("timeout", () => { socket.destroy(); resolve("timeout"); });
    socket.once("error", (error) => { socket.destroy(); resolve(error.code ?? "network_error"); });
  });
  console.log(JSON.stringify({ host, port, dns: "resolved", family: result.family, tcp, databaseWrites: 0 }));
} catch (error) { console.log(JSON.stringify({ host, port, dns: error.code ?? "dns_error", databaseWrites: 0 })); process.exitCode = 1; }
