import "server-only";

// Limitador em memória (janela deslizante). Em produção com várias instâncias,
// trocar por Redis mantendo a mesma assinatura.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryInMs: windowMs - (now - hits[0]) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
  return { ok: true, retryInMs: 0 };
}

export async function clientIp() {
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
}

/** Só consulta (não conta): usado no login, que conta apenas as tentativas erradas. */
export function isLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, hits);
  return hits.length >= limit ? { limited: true, retryInMs: windowMs - (now - hits[0]) } : { limited: false, retryInMs: 0 };
}

/** Registra uma tentativa (ex.: senha errada). */
export function hit(key: string) {
  const list = buckets.get(key) ?? [];
  list.push(Date.now());
  buckets.set(key, list);
}

/** Zera o contador (ex.: login certo depois de errar). */
export function clearHits(key: string) {
  buckets.delete(key);
}
