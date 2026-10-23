import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { authorization, attachmentDownloadUrl, validateRedirect, TrelloReader, hashFile } from "./api-client.mjs";

const card = "a".repeat(24), attachment = "b".repeat(24);
test("download usa host fixo e nome original sem aceitar IDs/caminhos arbitrários", () => {
  const url = attachmentDownloadUrl(card, { id: attachment, name: "renomeado", fileName: "original com espaço.png" });
  assert.equal(new URL(url).hostname, "api.trello.com"); assert.ok(url.endsWith("original%20com%20espa%C3%A7o.png"));
  assert.throws(() => attachmentDownloadUrl("../other", { id: attachment, fileName: "x" }), /INVALID_SOURCE_ID/);
  assert.throws(() => validateRedirect("https://api.trello.com.attacker.example/file", url), /REDIRECT_NOT_ALLOWED/);
  assert.throws(() => validateRedirect("http://api.trello.com/file", url), /REDIRECT_NOT_ALLOWED/);
});
test("credenciais ficam no cabeçalho e não acompanham redirecionamento ao storage", async () => {
  const requests = [];
  const reader = new TrelloReader("fake-key", "fake-token", async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? new Response(null, { status: 302, headers: { location: "https://bucket.s3.amazonaws.com/file" } }) : new Response("ok");
  });
  const response = await reader.request(`https://api.trello.com/1/cards/${card}/attachments/${attachment}/download/a.png`, true);
  await response.arrayBuffer();
  assert.equal(requests[0].options.headers.Authorization, authorization("fake-key", "fake-token"));
  assert.deepEqual(requests[1].options.headers, {});
  assert.ok(requests.every((request) => !request.url.includes("fake-key") && !request.url.includes("fake-token") && request.options.method === "GET"));
});
test("erro de permissão gera código seguro sem persistir corpo ou credenciais", async () => {
  const reader = new TrelloReader("fake-key", "fake-token", async () => new Response("body-with-sensitive-data", { status: 403 }));
  await assert.rejects(() => reader.json("members/me"), (error) => error.code === "HTTP_403" && !error.message.includes("sensitive"));
});
test("arquivo é conferido por tamanho/hash e resposta truncada não vira backup válido", async () => {
  const prefix = path.resolve("research/trello/local/tests");
  const { mkdir } = await import("node:fs/promises"); await mkdir(prefix, { recursive: true });
  const directory = await mkdtemp(path.join(prefix, "api-client-"));
  const filename = path.join(directory, "file.bin");
  try {
    const reader = new TrelloReader("fake-key", "fake-token", async () => new Response(Buffer.from([1, 2, 3, 4]), { headers: { "content-type": "image/png" } }));
    const result = await reader.download(card, { id: attachment, fileName: "file.png", bytes: 4 }, filename);
    assert.deepEqual(await readFile(filename), Buffer.from([1, 2, 3, 4]));
    assert.deepEqual(await hashFile(filename), { bytes: result.bytes, sha256: result.sha256 });
    await assert.rejects(() => reader.download(card, { id: attachment, fileName: "file.png", bytes: 5 }, filename + "2"), /SIZE_MISMATCH/);
    await assert.rejects(() => stat(filename + "2"), { code: "ENOENT" });
    await assert.rejects(() => stat(filename + "2.part"), { code: "ENOENT" });
  } finally {
    if (!directory.startsWith(prefix + path.sep)) throw new Error("Unsafe test cleanup");
    await rm(directory, { recursive: true, force: true });
  }
});
