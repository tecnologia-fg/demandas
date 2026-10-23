import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const fixture = (action) => {
  const result = spawnSync("docker", ["compose", "-f", "docker/trello-rehearsal.compose.yml", "exec", "-T", "web", "node", "scripts/trello/flow-fixture.mjs", action], { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout.trim());
};
const f = fixture("setup"), base = "http://localhost:3100", output = path.resolve("research/trello/local/rehearsal/flows"); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROME ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = [];
page.setDefaultTimeout(60000);
await page.route("**/*", (route) => new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com") ? route.abort() : route.continue());
page.on("pageerror", (error) => errors.push(error.message));
const navigate = (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
const openCard = async () => {
  await navigate(`${base}/quadros/${f.boardId}`);
  await page.waitForFunction((title) => [...document.querySelectorAll("button")].some((button) => button.textContent === title && Object.keys(button).some((key) => key.startsWith("__reactProps$"))), f.title);
  await page.getByRole("button", { name: f.title, exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Aprovação do cliente", exact: true }).waitFor();
};
try {
  await navigate(base + "/login"); await page.locator('input[name="email"]').fill(process.env.REHEARSAL_ADMIN_EMAIL); await page.locator('input[name="password"]').fill(process.env.REHEARSAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click(); await page.waitForURL(base + "/");
  await navigate(`${base}/quadros/${f.boardId}`);
  await page.waitForFunction(() => { const button = document.querySelector('button[aria-label="Nova demanda"]'); return button && Object.keys(button).some((key) => key.startsWith("__reactProps$")); });
  await page.locator('button[aria-label="Nova demanda"]').click();
  const modal = page.getByRole("dialog", { name: "Nova demanda", exact: true });
  await modal.getByRole("combobox", { name: "Começar de um modelo", exact: true }).selectOption(`trello:${f.sourceId}`);
  await modal.getByPlaceholder("Ex.: Arte do post de lançamento").fill(f.title); await modal.getByRole("button", { name: "Criar e abrir", exact: true }).click();
  await page.getByRole("heading", { name: "Aprovação do cliente", exact: true }).waitFor();
  const cloned = fixture("check-template");
  assert.equal(await page.getByRole("heading", { name: "Dados do Trello", exact: true }).count(), 0, "A new demand created from a Trello template is not an imported card");
  await page.getByRole("button", { name: "Enviar para aprovação", exact: true }).click();
  const composer = page.getByRole("dialog", { name: "Nova aprovação", exact: true });
  await composer.getByRole("button", { name: "Só texto", exact: true }).click();
  await composer.getByPlaceholder("O texto que o cliente vai aprovar").fill("Texto de validação local");
  await composer.getByRole("button", { name: "Enviar ao cliente", exact: true }).click();
  await page.getByText(/^Configure os destinos em Configurações/).waitFor(); assert.equal(fixture("probe").post, null);
  await composer.getByRole("button", { name: "Cancelar", exact: true }).click();
  await navigate(base + "/configuracoes/importar-trello/aprovacoes");
  await page.waitForFunction((name) => [...document.querySelectorAll("form")].some((form) => form.textContent.includes(name) && Object.keys(form).some((key) => key.startsWith("__reactProps$"))), f.name);
  for (const [key, label] of Object.entries({ approval: "Enviado ao cliente", next: "Cliente aprovou", back: "Cliente pediu ajustes", done: "Publicado" })) {
    await page.getByLabel(`${f.name}: ${label}`, { exact: true }).selectOption(f.columns[key]);
  }
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: f.name, exact: true }) });
  await form.getByRole("button", { name: "Salvar fluxo", exact: true }).click(); await form.getByText("Fluxo salvo por ID de coluna.", { exact: true }).waitFor();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Exportar fluxos salvos", exact: true }).click(); await (await download).saveAs(path.join(output, "approval-flows.json"));
  fixture("shuffle"); await openCard();
  await page.getByRole("button", { name: "Enviar para aprovação", exact: true }).click();
  await page.getByRole("dialog", { name: "Nova aprovação", exact: true }).getByRole("button", { name: "Só texto", exact: true }).click();
  await page.getByRole("dialog", { name: "Nova aprovação", exact: true }).getByPlaceholder("O texto que o cliente vai aprovar").fill("Texto de validação local");
  await page.getByRole("button", { name: "Enviar ao cliente", exact: true }).click(); await page.getByRole("dialog", { name: "Nova aprovação", exact: true }).waitFor({ state: "hidden" });
  let state = fixture("probe"); assert.equal(state.columnId, f.columns.approval); assert.equal(state.post.status, "PENDING");
  const publicContext = await browser.newContext(), client = await publicContext.newPage(); client.on("pageerror", (error) => errors.push(error.message));
  await client.route("**/*", (route) => new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com") ? route.abort() : route.continue());
  const clientNavigate = (url) => client.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const clientReady = (text) => client.waitForFunction((label) => [...document.querySelectorAll("button")].some((button) => button.textContent.includes(label) && Object.keys(button).some((key) => key.startsWith("__reactProps$"))), text);
  await clientNavigate(`${base}/aprovar/p/${state.post.token}`); await clientReady("Pedir ajuste"); await client.getByRole("button", { name: "Pedir ajuste", exact: true }).click();
  await client.getByLabel("O que precisa mudar", { exact: true }).fill("Ajuste de validação local"); await client.getByLabel("Seu nome", { exact: true }).fill("Cliente de teste");
  await client.getByRole("button", { name: "Enviar pedido de ajuste", exact: true }).click(); await client.getByText("Pedido de ajuste enviado para a equipe", { exact: true }).waitFor();
  state = fixture("probe"); assert.equal(state.columnId, f.columns.back); assert.equal(state.post.status, "CHANGES");
  await openCard(); await page.getByRole("button", { name: "Nova versão", exact: true }).click(); await page.getByRole("button", { name: "Enviar nova versão", exact: true }).click();
  await page.getByText("Nova versão enviada ao cliente", { exact: true }).waitFor(); assert.equal(fixture("probe").columnId, f.columns.approval);
  await client.reload({ waitUntil: "domcontentloaded" }); await clientReady("Aprovar"); await client.getByRole("button", { name: "Aprovar", exact: true }).click(); await client.getByRole("button", { name: /^Confirmar aprovação/ }).click();
  await client.getByText("Post aprovado. Obrigado!", { exact: true }).waitFor(); state = fixture("probe"); assert.equal(state.columnId, f.columns.next); assert.equal(state.post.status, "APPROVED");
  await openCard(); await page.getByRole("button", { name: "Conversa e versões", exact: true }).click(); await page.getByRole("button", { name: "Marcar publicado", exact: true }).click();
  await page.getByText("Marcado como publicado", { exact: true }).waitFor(); state = fixture("probe"); assert.equal(state.columnId, f.columns.done); assert.equal(state.post.status, "PUBLISHED"); assert.ok(state.completedAt);
  assert.deepEqual(errors, []); await page.screenshot({ path: path.join(output, "published.png") });
  await navigate(base + "/configuracoes/importar-trello/pendencias"); await page.getByRole("heading", { name: "Arquivos no backup (32)", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, "content-decisions-mobile.png") });
  const report = { passedAt: new Date().toISOString(), cloned, missingConfigurationBlocked: true, exportedPortableFlows: true, renamedAndReorderedColumns: true, sent: true, changes: true, approved: true, published: true, contentDecisionsVisible: true, errors };
  await writeFile(path.join(output, "verification.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: path.join(output, "failure.png") }); console.error(error.message); process.exitCode = 1; }
finally { await browser.close(); console.log(JSON.stringify(fixture("cleanup"))); }
