// Exercita o componente real com destinos fictícios. Não inicia Next nem acessa banco.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const output = path.join(root, "research/trello/local/ui-preview");
await mkdir(output, { recursive: true });
const snapshotRoot = process.argv[2] ? path.resolve(process.argv[2]) : null;
const inventory = JSON.parse(await readFile(snapshotRoot ? path.join(snapshotRoot, "manifest.json") : "research/trello/all-summary.json", "utf8"));
const manifest = Array.isArray(inventory) ? inventory : inventory.sources;
const expectedCards = manifest.reduce((sum, item) => sum + item.cards, 0);
const expectedAttachments = Array.isArray(inventory) ? manifest.reduce((sum, item) => sum + item.attachments, 0) : inventory.totals.attachments;
const files = manifest.map((item) => path.join(snapshotRoot ?? path.join(root, "research/trello/local/workspace"), "originals", item.filename));
const options = {
  boards: [{ id: "fixture-board", name: "Quadro de ensaio (fictício)", clientId: null, columns: [{ id: "fixture-inbox", name: "Caixa de entrada", isDone: false }, { id: "fixture-done", name: "Concluído", isDone: true }] }],
  clients: [], users: [], labels: [],
};
await writeFile(path.join(output, "entry.tsx"), `import {createRoot} from 'react-dom/client';import {TrelloImportPreview} from '${path.join(root, "src/components/settings/TrelloImportPreview").replaceAll("\\", "/")}';createRoot(document.getElementById('root')!).render(<TrelloImportPreview options={${JSON.stringify(options)}}/>);`);
await build({ entryPoints: [path.join(output, "entry.tsx")], outfile: path.join(output, "bundle.js"), bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
const html = `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`;
const bundle = await readFile(path.join(output, "bundle.js"));
const server = createServer((request, response) => {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:");
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : "text/html; charset=utf-8");
  response.end(request.url === "/bundle.js" ? bundle : html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser, page;
const errors = [], requests = [];
const blockedEnvironmentRequests = new Set();
try {
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROME ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  // Isola a injeção do antivírus local somente nesta página de teste.
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com")) {
      blockedEnvironmentRequests.add(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel("Arquivos de quadros Trello", { exact: false }).setInputFiles(files);
  await page.getByRole("status").filter({ hasText: `${manifest.length} quadros analisados` }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Quadros de origem" }).getByRole("button").count(), manifest.length);
  assert.ok((await page.locator("body").innerText()).includes(String(expectedCards)));
  await page.getByRole("button", { name: /^SPMAR\s*133/ }).click();
  assert.equal(await page.getByLabel("Nome da coluna para PLANEJAMENTO", { exact: true }).inputValue(), "Caixa de entrada");
  await page.getByLabel("Quadro de destino", { exact: true }).selectOption("fixture-board");
  assert.equal(await page.getByLabel("Destino de PLANEJAMENTO", { exact: true }).inputValue(), "fixture-inbox");
  const review = page.getByLabel("Revisei os destinos e as pendências deste quadro.", { exact: false });
  await review.check();
  await page.getByLabel("Nome da coluna para JOBS", { exact: true }).fill("Demandas avulsas");
  assert.equal(await review.isChecked(), false);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar rascunho", exact: true }).click();
  const download = await downloading;
  const planPath = path.join(output, "plan.json"); await download.saveAs(planPath);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(plan.sources.length, manifest.length); assert.equal(plan.boards.length, manifest.length); assert.equal(plan.status, "draft");
  assert.equal(plan.attachmentReport.length, expectedAttachments);
  const spmar = plan.boards.find((board) => board.sourceBoardId === "69c6c052fd24c610bedb958a");
  assert.ok(spmar.lists.some((list) => list.name === "Demandas avulsas"));
  assert.ok(plan.sources.every((source) => source.sha256.length === 64));
  await page.getByText("Relatório por anexo", { exact: false }).click();
  const reviewDownloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV de revisão manual", exact: true }).click();
  const reviewDownload = await reviewDownloading;
  const reviewPath = path.join(output, "manual-review.csv"); await reviewDownload.saveAs(reviewPath);
  const reviewCsv = await readFile(reviewPath, "utf8");
  const policyRows = plan.attachmentReport.filter((row) => row.boardId === spmar.sourceBoardId && row.status === "policy_review");
  assert.equal(policyRows.length, 3);
  for (const row of policyRows) assert.ok(reviewCsv.includes(row.attachmentId) && reviewCsv.includes(row.cardId));
  await page.getByLabel("Reabrir plano salvo", { exact: true }).setInputFiles(planPath);
  await page.getByRole("status").filter({ hasText: "Plano reaberto" }).waitFor();
  assert.equal(await page.getByLabel("Nome da coluna para JOBS", { exact: true }).inputValue(), "Demandas avulsas");
  const invalid = structuredClone(plan); invalid.sources[0].sha256 = "0".repeat(64);
  const invalidPath = path.join(output, "invalid.json"); await writeFile(invalidPath, JSON.stringify(invalid));
  await page.getByLabel("Reabrir plano salvo", { exact: true }).setInputFiles(invalidPath);
  await page.getByRole("alert").filter({ hasText: "arquivo diferente" }).waitFor();
  await page.getByLabel("Reabrir plano salvo", { exact: true }).setInputFiles(planPath);
  await page.getByRole("status").filter({ hasText: "Plano reaberto" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Overflow horizontal no celular");
  await page.getByLabel("Destino de PLANEJAMENTO", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "mobile.png") });
  assert.deepEqual(errors, []);
  const origin = new URL(page.url()).origin;
  const unexpected = requests.filter((request) => !blockedEnvironmentRequests.has(request.url) && (request.method !== "GET" || new URL(request.url).origin !== origin));
  assert.deepEqual(unexpected, [], "A prévia enviou dados para fora do navegador");
  console.log(`Navegador: ${manifest.length} arquivos / ${expectedCards} cards, ${expectedAttachments} registros de anexos no plano, CSV manual com IDs de card/anexo, equivalência de coluna, edição/revisão, exportação, reabertura e rejeição de hash divergente; desktop/celular sem overflow ou erro JavaScript; nenhuma requisição de gravação.`);
} catch (cause) {
  await page?.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  console.error("Erros JavaScript:", errors);
  throw cause;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
