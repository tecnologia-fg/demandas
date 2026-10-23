import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve("research/trello/local/rehearsal/label-review");
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROME ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], httpErrors = []; let applied = false;
await page.route("**/*", (route) => new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com") ? route.abort() : route.continue());
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 500) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
async function exported(name) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar associações aplicadas", exact: true }).click();
  const filename = path.join(root, name); await (await downloading).saveAs(filename);
  return JSON.parse(await readFile(filename, "utf8"));
}
try {
  await page.goto("http://localhost:3100/login");
  await page.locator('input[name="email"]').fill(process.env.REHEARSAL_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.REHEARSAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click(); await page.waitForURL("http://localhost:3100/");
  await page.goto("http://localhost:3100/configuracoes/importar-trello/etiquetas");
  await page.getByRole("heading", { name: "Revisar etiquetas do Trello", exact: true }).waitFor();
  const before = await exported("before.json"); assert.equal(before.associations.length, 303);
  const row = page.getByRole("region", { name: "Etiqueta Audiovisual", exact: true });
  await row.getByLabel("Ação para Audiovisual", { exact: true }).selectOption("existing");
  const target = await row.getByLabel("Destino para Audiovisual", { exact: true }).locator("option").evaluateAll((options) => options.find((option) => option.textContent.startsWith("Criação ·"))?.value);
  assert.ok(target); await row.getByLabel("Destino para Audiovisual", { exact: true }).selectOption(target);
  const unnamed = page.locator('section[aria-label^="Etiqueta Sem nome"]').first();
  await unnamed.locator("select").selectOption("ignore");
  await page.getByRole("button", { name: "Aplicar revisão de etiquetas", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Revisão aplicada" }).waitFor({ timeout: 120000 }); applied = true;
  const after = await exported("after.json");
  assert.ok(after.associations.filter((item) => item.sourceName === "Audiovisual").every((item) => item.target?.id === target));
  assert.ok(after.associations.some((item) => item.action === "ignore"));
  await page.getByRole("button", { name: "Desfazer última revisão", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Última revisão desfeita" }).waitFor({ timeout: 120000 }); applied = false;
  const restored = await exported("restored.json"); assert.equal(restored.fingerprint, before.fingerprint);
  await page.screenshot({ path: path.join(root, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(root, "mobile.png") });
  assert.deepEqual(errors, []);
  assert.deepEqual(httpErrors, []);
  await writeFile(path.join(root, "result.json"), JSON.stringify({ checkedAt: new Date().toISOString(), sourceLabels: 303, merge: true, ignore: true, undoRestoredFingerprint: true, errors }, null, 2));
  console.log("Revisão: 303 definições, merge real, ignorar, exportação e desfazer com restauração exata; desktop/celular aprovados.");
} catch (error) {
  await page.screenshot({ path: path.join(root, "failure.png"), fullPage: true }); console.error(error.message); process.exitCode = 1;
} finally {
  if (applied) {
    await page.getByRole("button", { name: "Desfazer última revisão", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Última revisão desfeita" }).waitFor({ timeout: 120000 });
  }
  await browser.close();
}
