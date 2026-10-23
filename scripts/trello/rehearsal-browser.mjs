import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3100";
assert.ok(["http://localhost:3100", "http://127.0.0.1:3100"].includes(base));
const output = path.resolve("research/trello/local/rehearsal/browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROME ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
const page = await context.newPage();
const errors = [], requests = [];
await page.route("**/*", (route) => new URL(route.request().url()).hostname.endsWith(".kaspersky-labs.com") ? route.abort() : route.continue());
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.request().method() === "POST") requests.push({ status: response.status(), path: new URL(response.url()).pathname }); });
try {
  await page.goto(base + "/login");
  await page.locator('input[name="email"]').fill(process.env.REHEARSAL_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.REHEARSAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(base + "/");
  const target = (kind, id) => "tr_" + createHash("sha256").update(`${kind}:${id}`).digest("hex").slice(0, 32);
  const checked = [];
  for (const id of ["69c6c0750ff4946f159b3e9e", "69c2a65991435669977b3f3f"]) {
    const board = JSON.parse(await readFile(`research/trello/local/api-capture/2026-10-22/boards/${id}/board-export.json`, "utf8"));
    await page.goto(`${base}/quadros/${target("board", board.id)}`);
    for (let index = 0; index < 3; index++) {
      const card = page.getByRole("button", { name: /^Demanda #/ }).nth(index);
      await card.waitFor(); const title = await card.getAttribute("aria-label");
      assert.equal(await card.locator("p > button").count(), 1, "Browser must load the corrected title interaction");
      await card.locator("p").first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15000 });
      await page.getByRole("dialog").getByRole("textbox").first().waitFor({ timeout: 15000 });
      await page.getByRole("dialog").getByRole("heading", { name: "Dados do Trello", exact: true }).waitFor();
      assert.ok(!(await page.getByRole("dialog").innerText()).includes("Não deu certo agora"));
      checked.push({ board: board.name, card: title, click: "title" });
      await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    const title = page.getByRole("button", { name: /^Demanda #/ }).first().locator("p").first();
    await title.scrollIntoViewIfNeeded(); const box = await title.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 7, box.y + box.height / 2 + 2, { steps: 3 }); await page.mouse.up();
    await page.getByRole("dialog").waitFor({ timeout: 4000 });
    checked.push({ board: board.name, click: "title_with_pointer_jitter" });
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.locator('button[aria-label="Nova demanda"]').click();
  await page.getByRole("dialog", { name: "Nova demanda", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const attachmentRows = JSON.parse(await readFile("research/trello/local/api-capture/2026-10-22/reports/attachments.json", "utf8"));
  const probe = attachmentRows.find((item) => item.attachmentScope && item.status === "downloaded" && !item.policyReview && item.bytes > 0 && item.bytes < 1024 * 1024);
  const response = await context.request.get(`${base}/api/anexos/${target("attachment", probe.attachmentId)}?baixar`);
  assert.equal(response.status(), 200);
  assert.equal(createHash("sha256").update(await response.body()).digest("hex"), probe.sha256);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, "card-open.png") });
  await writeFile(path.join(output, `${new URL(base).hostname}-interaction.json`), JSON.stringify({ checkedAt: new Date().toISOString(), checked, requests, errors }, null, 2));
  console.log(JSON.stringify({ base, cardsOpened: checked.length, newDemandDialog: true, downloadedFileHash: true, errors }));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png") });
  console.log(JSON.stringify({ failed: error.message.split("\n")[0], requests, errors, url: page.url() })); process.exitCode = 1;
} finally { await browser.close(); }
