import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const fixture = (action) => {
  const r = spawnSync("docker", ["compose", "-f", "docker/trello-rehearsal.compose.yml", "exec", "-T", "web", "node", "scripts/trello/flow-fixture.mjs", action], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim());
};
const f = fixture("setup"); fixture("add-review-cards");
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROME ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
page.setDefaultTimeout(60000);
await page.route("**/*", (route) => new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com") ? route.abort() : route.continue());
page.on("pageerror", (e) => errors.push(e.message));
const source = async () => {
  await page.goto(`http://localhost:3100/quadros/${f.boardId}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const b = document.querySelector('button[aria-label="Opções do quadro"]'); return b && Object.keys(b).some((k) => k.startsWith("__reactProps$")); }, null, { timeout: 15000 });
};
try {
  await page.goto("http://localhost:3100/login", { waitUntil: "domcontentloaded" });
  await page.locator('[name="email"]').fill(process.env.REHEARSAL_ADMIN_EMAIL); await page.locator('[name="password"]').fill(process.env.REHEARSAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click(); await page.waitForURL("http://localhost:3100/");
  await source();
  const column = page.getByLabel("Coluna inbox original: arraste para reordenar", { exact: true });
  const from = await column.boundingBox(), to = await page.getByLabel("Coluna approval original: arraste para reordenar", { exact: true }).boundingBox();
  assert.ok(from && to);
  await page.mouse.move(from.x + 70, from.y + 20); await page.mouse.down();
  await page.mouse.move(from.x + 85, from.y + 20, { steps: 4 });
  await page.waitForFunction(() => document.querySelector('header[aria-label="Coluna inbox original: arraste para reordenar"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 15000 });
  await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 20 });
  const reordered = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/quadros/${f.boardId}`);
  await page.mouse.up(); await reordered;
  const order = fixture("check-order");
  await page.getByRole("button", { name: "Opções do quadro", exact: true }).click(); await page.getByRole("button", { name: "Duplicar quadro", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Duplicar quadro", exact: true });
  await modal.getByRole("textbox").fill(`Copia revisao ${f.prefix}`); await modal.getByRole("button", { name: "Duplicar", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/quadros/") && !url.pathname.endsWith(f.boardId)); const copy = fixture("check-copy");
  await source(); await page.getByRole("button", { name: "Opções do quadro", exact: true }).click(); await page.getByRole("button", { name: "Salvar como modelo", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Salvar como modelo de quadro", exact: true });
  await modal.getByRole("textbox").fill(`Modelo revisao ${f.prefix}`); await modal.getByRole("button", { name: "Salvar modelo", exact: true }).click(); await modal.waitFor({ state: "hidden" });
  const template = fixture("check-board-template"); assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), order, copy, template, errors }; await writeFile("research/trello/local/rehearsal/review-browser.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (e) { await page.screenshot({ path: "research/trello/local/rehearsal/review-browser-failure.png" }); console.error(e.message); process.exitCode = 1; }
finally { await browser.close(); console.log(JSON.stringify(fixture("cleanup"))); }
