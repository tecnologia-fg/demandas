import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export class CaptureError extends Error {
  constructor(code, status = null) { super(code); this.code = code; this.status = status; }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function authorization(key, token) {
  if (!key || !token || /["\\\r\n]/.test(key + token)) throw new CaptureError("CREDENTIALS_MISSING_OR_MALFORMED");
  return `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;
}
export function attachmentDownloadUrl(cardId, attachment) {
  if (!/^[a-f0-9]{24}$/.test(cardId) || !/^[a-f0-9]{24}$/.test(attachment.id)) throw new CaptureError("INVALID_SOURCE_ID");
  let filename = attachment.fileName;
  if (!filename) {
    try { filename = decodeURIComponent(new URL(attachment.url).pathname.split("/").at(-1)); } catch { /* handled below */ }
  }
  if (!filename) throw new CaptureError("ATTACHMENT_FILENAME_MISSING");
  return `https://api.trello.com/1/cards/${cardId}/attachments/${attachment.id}/download/${encodeURIComponent(filename)}`;
}
export function validateRedirect(value, previous) {
  const url = new URL(value, previous);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || !(host === "trello.com" || host.endsWith(".trello.com") || host.endsWith(".amazonaws.com"))) throw new CaptureError("REDIRECT_NOT_ALLOWED");
  return url;
}
export async function hashFile(filename) {
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(filename)) { bytes += chunk.length; hash.update(chunk); }
  return { bytes, sha256: hash.digest("hex") };
}
export class TrelloReader {
  constructor(key, token, fetchImpl = fetch) { this.auth = authorization(key, token); this.fetch = fetchImpl; this.nextRequest = 0; this.requests = 0; }
  async pace() {
    const delay = Math.max(0, this.nextRequest - Date.now());
    this.nextRequest = Math.max(Date.now(), this.nextRequest) + 180;
    if (delay) await pause(delay);
  }
  async request(url, binary = false) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.pace();
      try {
        let current = new URL(url), response;
        if (current.protocol !== "https:" || current.hostname !== "api.trello.com") throw new CaptureError("INITIAL_HOST_NOT_ALLOWED");
        for (let hop = 0; hop < 6; hop++) {
          const headers = current.hostname === "api.trello.com" || current.hostname === "trello.com" ? { Authorization: this.auth } : {};
          this.requests++;
          response = await this.fetch(current.href, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(binary ? 600000 : 60000) });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!binary || !location) throw new CaptureError("UNEXPECTED_REDIRECT");
          current = validateRedirect(location, current.href);
          if (hop === 5) throw new CaptureError("TOO_MANY_REDIRECTS");
        }
        if (response.ok) return response;
        const status = response.status;
        const retryAfter = Number(response.headers.get("retry-after"));
        await response.body?.cancel();
        if (status === 429 || status >= 500) {
          if (attempt < 4) { await pause(Math.min(30000, Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0))); continue; }
        }
        throw new CaptureError(`HTTP_${status}`, status);
      } catch (error) {
        if (error instanceof CaptureError) throw error;
        if (attempt === 4) throw new CaptureError("NETWORK_OR_TIMEOUT");
        await pause(1000 * 2 ** attempt);
      }
    }
    throw new CaptureError("RETRIES_EXHAUSTED");
  }
  async json(route, query = {}) {
    const url = new URL(`https://api.trello.com/1/${route}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await this.request(url.href);
    let data;
    try { data = await response.json(); } catch { throw new CaptureError("INVALID_JSON_RESPONSE"); }
    return data;
  }
  async download(cardId, attachment, destination) {
    const expected = Number.isFinite(attachment.bytes) ? attachment.bytes : null;
    const maxBytes = 2 * 1024 * 1024 * 1024;
    if (expected > maxBytes) throw new CaptureError("CAPTURE_FILE_LIMIT_2_GIB");
    const response = await this.request(attachmentDownloadUrl(cardId, attachment), true);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (/^(text\/html|application\/json)\b/i.test(contentType)) { await response.body?.cancel(); throw new CaptureError("UNEXPECTED_NON_FILE_RESPONSE"); }
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.part`;
    const handle = await open(temporary, "w");
    const hash = createHash("sha256"); let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new CaptureError("CAPTURE_FILE_LIMIT_2_GIB");
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const result = await handle.write(chunk, offset, chunk.length - offset); offset += result.bytesWritten; }
      }
      if (expected !== null && bytes !== expected) throw new CaptureError("SIZE_MISMATCH");
      await handle.close();
      await rename(temporary, destination);
      if ((await stat(destination)).size !== bytes) throw new CaptureError("LOCAL_SIZE_MISMATCH");
      return { bytes, sha256: hash.digest("hex"), contentType };
    } catch (error) {
      await handle.close().catch(() => {}); await rm(temporary, { force: true }).catch(() => {});
      throw error instanceof CaptureError ? error : new CaptureError("DOWNLOAD_STREAM_FAILED");
    }
  }
}
