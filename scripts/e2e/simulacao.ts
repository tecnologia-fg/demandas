/**
 * Simulação completa de uso do Dmanda (ponta a ponta, num Chrome de verdade).
 *
 * Duas pessoas ao mesmo tempo: A = admin@demanda.local (administrador) e B = ana@demanda.local (equipe), com a
 * senha de demonstração do .env (SEED_ADMIN_PASSWORD). Tudo que a simulação cria leva o prefixo "E2E" e é
 * anotado por id; no fim, a limpeza apaga SÓ esses ids (nunca por nome/trecho de texto).
 *
 * Rodar com o app no ar (padrão http://localhost:3000, mude com E2E_BASE):
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/e2e/simulacao.ts
 * Prints de falha vão para E2E_SHOTS (padrão: /tmp/dmanda-e2e).
 * Usa o Google Chrome instalado (caminho do Mac por padrão, mude com E2E_CHROME).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const SHOTS = process.env.E2E_SHOTS ?? "/tmp/dmanda-e2e";
const CHROME = process.env.E2E_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TAG = `E2E ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;

const db = new PrismaClient();
const created = { boards: [] as string[], clients: [] as string[], labels: [] as string[], templates: [] as string[], boardTemplates: [] as string[], users: [] as string[] };
const results: { step: string; ok: boolean; ms: number; error?: string }[] = [];
const startedAt = new Date();

fs.mkdirSync(SHOTS, { recursive: true });

async function step(name: string, page: Page | null, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ step: name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    results.push({ step: name, ok: false, ms: Date.now() - t0, error: msg });
    console.log(`  ✗ ${name}: ${msg}`);
    if (page) await page.screenshot({ path: path.join(SHOTS, `falha-${results.length}.png`), fullPage: false }).catch(() => {});
  }
}

function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, msg: string, timeout = 6000) {
  const t0 = Date.now();
  let last: T | undefined;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${msg} (último valor: ${JSON.stringify(last)})`);
}

async function login(ctx: BrowserContext, email: string) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  return page;
}

/** Linha de propriedade na janela da demanda (ex.: "Prioridade"). */
function prop(page: Page, label: string) {
  return page.getByRole("dialog").locator("div.grid", { has: page.locator(`span:text-is("${label}")`) }).last().getByRole("button").first();
}

async function cardByTitle(title: string) {
  return db.card.findFirst({ where: { title, boardId: { in: created.boards } }, include: { column: true, labels: true, assignees: true, checklists: { include: { items: true } } } });
}

async function main() {
  expect(PASSWORD.length >= 8, "SEED_ADMIN_PASSWORD ausente no .env");
  const admin = await db.user.findUnique({ where: { email: "admin@demanda.local" } });
  const ana = await db.user.findUnique({ where: { email: "ana@demanda.local" } });
  expect(admin?.active && ana?.active, "contas de demonstração inativas");
  const adminName = admin!.name;

  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  ctxA.setDefaultTimeout(8000);
  ctxB.setDefaultTimeout(8000);
  const consoleErrors: string[] = [];

  let A!: Page;
  let B!: Page;
  const boardName = `${TAG} Quadro`;
  const clientName = `${TAG} Cliente`;
  let boardId = "";
  let boardUrl = "";

  console.log(`\nSimulação ${TAG}\n`);

  // ---------------------------------------------------------------- 1. acesso
  await step("1. Login com senha errada mostra erro", null, async () => {
    const p = await ctxA.newPage();
    await p.goto(`${BASE}/login`);
    await p.locator('input[name="email"]').fill("admin@demanda.local");
    await p.locator('input[name="password"]').fill("senha-errada-123");
    await p.getByRole("button", { name: "Entrar" }).click();
    await p.getByText("E-mail ou senha incorretos.").waitFor({ timeout: 8000 });
    expect((await p.locator('input[name="email"]').inputValue()) === "admin@demanda.local", "e-mail sumiu depois do erro");
    await p.close();
  });

  await step("2. Login das duas pessoas (A admin, B equipe)", null, async () => {
    A = await login(ctxA, "admin@demanda.local");
    B = await login(ctxB, "ana@demanda.local");
    for (const p of [A, B]) p.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
    await A.getByRole("heading", { level: 1 }).waitFor();
  });

  // ---------------------------------------------------------------- 2. cliente e quadro
  await step("3. Cadastrar cliente", A, async () => {
    await A.goto(`${BASE}/clientes`);
    await A.getByRole("button", { name: "Novo cliente" }).first().click();
    await A.getByPlaceholder("Ex.: Aurora Cosméticos").fill(clientName);
    await A.getByRole("dialog").getByLabel("Pessoa de contato").fill("Contato Teste");
    await A.getByRole("dialog").getByLabel("E-mail").fill("contato@e2e.test");
    await A.getByRole("button", { name: "Cadastrar" }).click();
    const c = await waitFor(() => db.client.findFirst({ where: { name: clientName } }), Boolean, "cliente não gravou");
    created.clients.push(c!.id);
    expect(c!.contact === "Contato Teste" && c!.email === "contato@e2e.test", "contato/e-mail no campo errado");
    await A.getByRole("heading", { name: clientName }).waitFor();
  });

  await step("4. Criar quadro pelo modelo Básico com cliente padrão", A, async () => {
    await A.goto(`${BASE}/quadros`);
    await A.getByRole("button", { name: "Novo quadro" }).first().click();
    const dlg = A.getByRole("dialog");
    await dlg.getByLabel("Nome").fill(boardName);
    await dlg.getByRole("button", { name: /Básico/ }).click();
    await dlg.getByRole("button", { name: "Nenhum" }).click();
    await A.getByPlaceholder("Buscar ou cadastrar cliente").fill(clientName);
    await A.getByRole("button", { name: clientName }).click();
    await dlg.getByRole("button", { name: "Criar quadro" }).click();
    await A.waitForURL(/\/quadros\/[a-z0-9]+/, { timeout: 15000 });
    boardUrl = A.url().split("?")[0];
    boardId = boardUrl.split("/").pop()!;
    created.boards.push(boardId);
    const b = await db.board.findUnique({ where: { id: boardId }, include: { columns: true } });
    expect(b?.columns.length === 4, `quadro com ${b?.columns.length} colunas`);
    expect(b?.clientId === created.clients[0], "cliente padrão não gravou");
  });

  // ---------------------------------------------------------------- 3. colunas
  await step("5. Criar, renomear, colorir e limitar coluna", A, async () => {
    await A.getByRole("button", { name: "Nova coluna" }).click();
    await A.getByPlaceholder("Nome da coluna").fill("E2E Extra");
    await A.getByRole("button", { name: "Criar coluna" }).click();
    await A.getByRole("region", { name: "Coluna E2E Extra" }).waitFor();
    await A.getByRole("button", { name: "Cancelar" }).click().catch(() => {});
    const col = A.getByRole("region", { name: "Coluna E2E Extra" });
    await col.getByRole("heading", { name: "E2E Extra" }).dblclick();
    await col.locator("input").fill("E2E Revisada");
    await col.locator("input").press("Enter");
    await A.getByRole("region", { name: "Coluna E2E Revisada" }).waitFor();
    const col2 = A.getByRole("region", { name: "Coluna E2E Revisada" });
    await col2.getByRole("button", { name: "Opções da coluna" }).click();
    await A.getByRole("button", { name: "Cor #1F8FA8" }).click();
    await A.getByPlaceholder("Sem limite").fill("2");
    await A.getByRole("button", { name: "Salvar" }).click();
    await A.keyboard.press("Escape");
    const c = await waitFor(() => db.column.findFirst({ where: { boardId, name: "E2E Revisada" } }), (c) => c?.color === "#1F8FA8" && c?.wipLimit === 2, "cor/limite não gravaram");
    expect(c, "coluna");
  });

  // ---------------------------------------------------------------- 4. demandas
  const t1 = `${TAG} Post de lançamento`;
  const t2 = `${TAG} Legenda`;
  const t3 = `${TAG} Banner`;
  await step("6. Criação rápida: ⌘ Enter cria várias, Enter cria e abre", A, async () => {
    const col = A.getByRole("region", { name: "Coluna A fazer" });
    await col.getByRole("button", { name: "Nova demanda", exact: true }).click();
    const ta = col.getByLabel("Título da nova demanda");
    for (const t of [t1, t2, t3]) {
      await ta.fill(t);
      await ta.press("Meta+Enter");
      await ta.press("Meta+Enter"); // repetido com o campo vazio: não pode duplicar
      await col.getByText(t).waitFor();
    }
    await ta.fill(`${TAG} Aberta na hora`);
    await ta.press("Enter");
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.waitFor();
    expect((await dlg.getByLabel("Título da demanda").inputValue()) === `${TAG} Aberta na hora`, "a demanda aberta não é a recém-criada");
    await A.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
    const n = await db.card.count({ where: { boardId, title: { in: [t1, t2, t3] } } });
    expect(n === 3, `esperava 3 demandas, achou ${n}`);
    const c = await cardByTitle(t1);
    expect(c?.clientId === created.clients[0], "demanda não herdou o cliente padrão do quadro");
  });

  await step("7. Nova demanda pela janela (cliente, prazo, responsável)", A, async () => {
    await A.keyboard.press("n"); // tecla rápida
    const dlg = A.getByRole("dialog", { name: "Nova demanda" });
    await dlg.waitFor();
    await dlg.getByLabel("Título").fill(`${TAG} Vídeo institucional`);
    await dlg.getByRole("button", { name: "Sem prazo" }).click();
    await A.getByRole("button", { name: "Amanhã" }).click();
    await dlg.getByRole("button", { name: "Ninguém ainda" }).click();
    await A.getByRole("button", { name: /^AS Ana Souza/ }).click();
    await A.keyboard.press("Escape");
    await dlg.getByRole("button", { name: /Amanhã/ }).waitFor();
    await dlg.getByRole("button", { name: "Criar e abrir" }).click();
    await A.getByRole("dialog", { name: "Demanda" }).waitFor();
    const c = await cardByTitle(`${TAG} Vídeo institucional`);
    expect(c?.dueDate && c.assignees.some((a) => a.userId === ana!.id), "prazo ou responsável não gravou");
    await A.keyboard.press("Escape");
    await A.getByRole("dialog", { name: "Demanda" }).waitFor({ state: "detached" });
  });

  // ---------------------------------------------------------------- 5. janela da demanda
  await step("8. Editar título, descrição colada com formatação e propriedades", A, async () => {
    await A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t1}`) }).click();
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByLabel("Título da demanda").waitFor();
    await dlg.getByLabel("Título da demanda").fill(`${t1} v2`);
    await dlg.getByLabel("Título da demanda").press("Enter");
    // descrição: cola HTML com negrito, lista, link e um script (que precisa sumir)
    await dlg.getByText(/Escreva o briefing/).click();
    const ed = dlg.locator(".rich-editor");
    await ed.click();
    await ed.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/html", '<h2>Briefing</h2><p><strong>Objetivo:</strong> lista de espera</p><ul><li>3 posts</li><li>6 stories</li></ul><p><a href="https://exemplo.com">Ref</a><script>alert(1)</script><img src=x onerror=alert(1)></p>');
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await dlg.getByRole("button", { name: "Salvar" }).click();
    await dlg.locator(".rich h2", { hasText: "Briefing" }).waitFor();
    await prop(A, "Prioridade").click();
    await A.getByRole("button", { name: "Alta" }).click();
    await prop(A, "Prazo").click();
    await A.getByRole("button", { name: "Hoje" }).click();
    await prop(A, "Repetir").click();
    await A.getByRole("button", { name: "Toda semana" }).click();
    await prop(A, "Estimativa").click();
    await A.getByRole("button", { name: "2 h" }).click();
    const c = await waitFor(() => cardByTitle(`${t1} v2`), (c) => Boolean(c?.priority === "HIGH" && c?.repeatEvery === "WEEKLY" && c?.estimatedMin === 120 && c?.dueDate), "propriedades não gravaram");
    expect(c!.description?.includes("<strong>Objetivo:</strong>"), "formatação não gravou");
    expect(!c!.description?.includes("<script") && !c!.description?.includes("onerror"), "script passou pela limpeza!");
  });

  let labelId = "";
  await step("9. Criar etiqueta, marcar responsável e cliente", A, async () => {
    await prop(A, "Etiquetas").click();
    await A.getByPlaceholder("Buscar ou criar etiqueta").fill(`${TAG} Urgente`);
    await A.getByRole("button", { name: new RegExp(`Criar etiqueta`) }).click();
    await A.getByRole("button", { name: "Criar", exact: true }).click();
    const lab = await waitFor(() => db.label.findFirst({ where: { name: `${TAG} Urgente` } }), Boolean, "etiqueta não gravou");
    created.labels.push(lab!.id);
    await A.keyboard.press("Escape");
    await prop(A, "Pessoas").click();
    await A.getByRole("button", { name: /^AS Ana Souza/ }).click();
    await A.getByRole("button", { name: new RegExp(`${adminName} \\(você\\)`) }).click();
    await A.keyboard.press("Escape");
    const c = await waitFor(() => cardByTitle(`${t1} v2`), (c) => (c?.labels.length ?? 0) === 1 && (c?.assignees.length ?? 0) === 2, "etiqueta/pessoas não gravaram");
    labelId = c!.labels[0].labelId;
  });

  await step("10. Checklist: lista, itens, marcar e desmarcar", A, async () => {
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByRole("button", { name: "Nova lista" }).click();
    await dlg.getByRole("button", { name: "Criar", exact: true }).click();
    const add = dlg.getByPlaceholder("Adicionar item e apertar Enter");
    for (const t of ["Roteiro", "Gravação", "Edição"]) {
      await add.fill(t);
      await add.press("Enter");
      await dlg.locator(`input[value="${t}"]`).waitFor();
    }
    await dlg.getByRole("checkbox", { name: "Roteiro" }).click();
    await dlg.getByRole("checkbox", { name: "Gravação" }).click();
    await dlg.getByRole("checkbox", { name: "Gravação" }).click();
    const c = await waitFor(() => cardByTitle(`${t1} v2`), (c) => {
      const items = c?.checklists.flatMap((l) => l.items) ?? [];
      return items.length === 3 && items.filter((i) => i.done).length === 1;
    }, "checklist não gravou certo");
    expect(c, "checklist");
    // o card no quadro mostra 1/3
    await A.locator("text=1/3").first().waitFor();
  });

  await step("11. Comentário com @menção, editar comentário", A, async () => {
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    const box = dlg.locator(".rich-editor").last();
    await box.click();
    await A.keyboard.type("Pode revisar, ");
    await A.keyboard.type("@Ana");
    await A.locator("div.fixed button", { hasText: "Ana Souza" }).first().waitFor();
    await A.keyboard.press("Enter");
    await A.keyboard.type(" obrigado!");
    await dlg.getByRole("button", { name: "Comentar" }).click();
    await dlg.locator(".rich .mention", { hasText: "Ana Souza" }).waitFor();
    const n = await waitFor(() => db.notification.count({ where: { userId: ana!.id, type: "MENTION", createdAt: { gte: startedAt } } }), (n) => n >= 1, "menção não notificou a Ana");
    expect(n, "notificação");
    const comment = dlg.locator(".group", { hasText: "obrigado!" }).first();
    await comment.hover();
    await comment.getByRole("button", { name: "Editar" }).click();
    await dlg.locator(".rich-editor").last().click();
    await A.keyboard.press("End");
    await A.keyboard.type(" Valeu.");
    await comment.getByRole("button", { name: "Salvar" }).click();
    await dlg.getByText("(editado)").waitFor();
  });

  await step("12. Anexar arquivo, abrir e ver no histórico", A, async () => {
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    const file = path.join(SHOTS, "briefing-e2e.txt");
    fs.writeFileSync(file, "arquivo de teste da simulação");
    await dlg.locator('input[type="file"]').setInputFiles(file);
    await dlg.getByText("briefing-e2e.txt").first().waitFor({ timeout: 10000 });
    const c = await cardByTitle(`${t1} v2`);
    const a = await db.attachment.findFirst({ where: { cardId: c!.id } });
    expect(a, "anexo não gravou");
    const r = await A.request.get(`${BASE}/api/anexos/${a!.id}`);
    expect(r.status() === 200 && (await r.text()).includes("arquivo de teste"), "download do anexo falhou");
    await dlg.getByRole("button", { name: "Histórico" }).click();
    await dlg.getByText(/anexou briefing-e2e.txt/).waitFor();
    await dlg.getByRole("button", { name: /Comentários/ }).click();
  });

  await step("13. Cronômetro: iniciar e pausar", A, async () => {
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByRole("button", { name: "Iniciar cronômetro" }).click();
    await dlg.getByText("Cronômetro rodando").waitFor();
    await A.waitForTimeout(1200);
    await dlg.getByRole("button", { name: "Pausar cronômetro" }).click();
    await dlg.getByText(/Tempo gasto no total|Cronometrar o trabalho/).waitFor();
    const c = await cardByTitle(`${t1} v2`);
    const e = await db.timeEntry.findFirst({ where: { cardId: c!.id, endedAt: { not: null } } });
    expect(e, "tempo não gravou");
  });

  await step("14. Esc: primeiro sai do campo, depois fecha só a janela de cima", A, async () => {
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Mover para outro quadro" }).click();
    await A.getByRole("dialog", { name: "Mover para outro quadro" }).waitFor();
    await A.keyboard.press("Escape");
    await A.getByRole("dialog", { name: "Mover para outro quadro" }).waitFor({ state: "detached" });
    expect(await dlg.isVisible(), "Esc fechou as duas janelas");
    await dlg.getByLabel("Título da demanda").click();
    await A.keyboard.press("Escape");
    expect(await dlg.isVisible(), "Esc dentro do campo fechou a janela");
    await A.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
    const overflow = await A.evaluate(() => document.body.style.overflow);
    expect(overflow !== "hidden", "rolagem da página ficou travada");
  });

  await step("15. Menu do card: duplicar, arquivar, desfazer (sem abrir o card)", A, async () => {
    const tile = A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t2}`) });
    await tile.hover();
    await tile.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Duplicar" }).click();
    await A.getByText(`${t2} (cópia)`).waitFor();
    expect(!(await A.getByRole("dialog", { name: "Demanda" }).isVisible()), "o menu abriu o card");
    const copy = A.getByRole("button", { name: new RegExp(`${t2} \\(cópia\\)`) });
    await copy.hover();
    await copy.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Arquivar" }).click();
    await A.getByRole("button", { name: "Desfazer" }).click();
    await A.getByText(`${t2} (cópia)`).waitFor();
    await copy.hover();
    await copy.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Excluir" }).click();
    await A.getByRole("dialog", { name: "Excluir demanda?" }).getByRole("button", { name: "Excluir" }).click();
    await waitFor(() => db.card.count({ where: { boardId, title: `${t2} (cópia)` } }), (n) => n === 0, "cópia não foi excluída");
  });

  await step("16. Arrastar demanda entre colunas", A, async () => {
    const tile = A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t3}`) });
    const target = A.getByRole("region", { name: "Coluna Fazendo" });
    const a = await tile.boundingBox();
    const b = await target.boundingBox();
    await A.mouse.move(a!.x + a!.width / 2, a!.y + 20);
    await A.mouse.down();
    await A.mouse.move(a!.x + a!.width / 2 + 20, a!.y + 30, { steps: 5 });
    await A.mouse.move(b!.x + b!.width / 2, b!.y + 80, { steps: 15 });
    await A.mouse.up();
    const c = await waitFor(() => cardByTitle(t3), (c) => c?.column.name === "Fazendo", "a demanda não foi para Fazendo");
    expect(c, "arraste");
  });

  await step("17. Arrastar para Concluído conclui e cria a repetição na hora", A, async () => {
    const tile = A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t1} v2`) });
    const target = A.getByRole("region", { name: "Coluna Concluído" });
    await target.scrollIntoViewIfNeeded();
    const a = await tile.boundingBox();
    const b = await target.boundingBox();
    await A.mouse.move(a!.x + a!.width / 2, a!.y + 20);
    await A.mouse.down();
    await A.mouse.move(a!.x + a!.width / 2 + 20, a!.y + 30, { steps: 5 });
    await A.mouse.move(b!.x + b!.width / 2, b!.y + 60, { steps: 20 });
    await A.mouse.up();
    await waitFor(() => cardByTitle(`${t1} v2`), (c) => Boolean(c?.completedAt), "não concluiu");
    await A.getByText(/Próxima repetição criada/).waitFor({ timeout: 6000 });
    const n = await db.card.count({ where: { boardId, title: `${t1} v2` } });
    expect(n === 2, `repetição: esperava 2 demandas com o título, achou ${n}`);
  });

  await step("18. Filtros, lista e calendário", A, async () => {
    await A.getByRole("button", { name: /Filtros/ }).click();
    await A.getByRole("button", { name: "Esconder concluídas" }).click().catch(async () => {
      await A.getByText("Esconder concluídas").click();
    });
    await A.keyboard.press("Escape");
    await A.getByRole("tab", { name: /Lista/ }).click();
    await A.getByText(t2).first().waitFor();
    await A.getByRole("tab", { name: /Calendário/ }).click();
    await A.getByText(/Sem prazo/).first().waitFor();
    await A.getByRole("tab", { name: /Quadro/ }).click();
    await A.getByRole("button", { name: /Filtros/ }).click();
    await A.getByRole("button", { name: "Limpar tudo" }).click();
    await A.keyboard.press("Escape");
  });

  await step("19. Busca ⌘K abre a demanda", A, async () => {
    await A.keyboard.press("Meta+k");
    await A.getByPlaceholder(/Buscar por título/).fill(t3);
    await A.getByText(t3).last().waitFor();
    await A.keyboard.press("Enter");
    await A.getByRole("dialog", { name: "Demanda" }).waitFor();
    await A.keyboard.press("Escape");
  });

  // ---------------------------------------------------------------- 6. duas pessoas ao vivo
  await step("20. Ao vivo: B vê na hora o que A muda, e recebe a menção", B, async () => {
    await B.goto(boardUrl);
    await B.getByText(t3).first().waitFor();
    // o sino da Ana mostra a menção
    await B.getByRole("button", { name: /Notificações, \d+ novas/ }).first().waitFor({ timeout: 8000 });
    // A comenta e move uma demanda; B vê sem recarregar
    const tile = A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t2}`) });
    await tile.click();
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByRole("button", { name: "Mudar de coluna" }).click();
    await A.getByRole("button", { name: "Revisão" }).click();
    await A.keyboard.press("Escape");
    const colB = B.getByRole("region", { name: "Coluna Revisão" });
    await colB.getByText(t2).waitFor({ timeout: 5000 });
  });

  await step("21. B não pode excluir demanda criada por A (pode arquivar)", B, async () => {
    const tile = B.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t2}`) });
    await tile.hover();
    await tile.getByRole("button", { name: "Ações da demanda" }).click();
    await B.getByRole("button", { name: "Excluir" }).click();
    await B.getByRole("dialog", { name: "Excluir demanda?" }).getByRole("button", { name: "Excluir" }).click();
    await B.getByText(/Só quem criou a demanda/).waitFor();
    expect(await db.card.count({ where: { boardId, title: t2 } }) === 1, "B conseguiu excluir");
  });

  // ---------------------------------------------------------------- 7. modelos, coluna, quadro
  await step("22. Salvar como modelo e criar demanda a partir dele", A, async () => {
    await A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t3}`) }).click();
    const dlg = A.getByRole("dialog", { name: "Demanda" });
    await dlg.getByRole("button", { name: "Nova lista" }).click();
    await dlg.getByRole("button", { name: "Criar", exact: true }).click();
    const add = dlg.getByPlaceholder("Adicionar item e apertar Enter");
    for (const t of ["Arte", "Aprovação"]) {
      await add.fill(t);
      await add.press("Enter");
      await dlg.locator(`input[value="${t}"]`).waitFor();
    }
    await dlg.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Salvar como modelo" }).click();
    await A.getByRole("dialog", { name: "Salvar como modelo" }).getByLabel("Nome do modelo").fill(`${TAG} Modelo banner`);
    await A.getByRole("button", { name: "Salvar modelo" }).click();
    const tpl = await waitFor(() => db.cardTemplate.findFirst({ where: { name: `${TAG} Modelo banner` } }), Boolean, "modelo não gravou");
    created.templates.push(tpl!.id);
    await A.keyboard.press("Escape");
    await A.getByRole("dialog", { name: "Demanda" }).waitFor({ state: "detached" });
    await A.getByRole("button", { name: "Nova demanda", exact: true }).last().click();
    const nd = A.getByRole("dialog", { name: "Nova demanda" });
    await nd.getByRole("button", { name: new RegExp(`${TAG} Modelo banner`) }).click();
    await nd.getByLabel("Título").fill(`${TAG} Banner do modelo`);
    await nd.getByRole("button", { name: "Criar e abrir" }).click();
    await A.getByRole("dialog", { name: "Demanda" }).waitFor();
    const c = await waitFor(() => cardByTitle(`${TAG} Banner do modelo`), (c) => (c?.checklists[0]?.items.length ?? 0) === 2, "modelo não aplicou o checklist");
    expect(c, "modelo");
    await A.keyboard.press("Escape");
  });

  await step("23. Excluir coluna com demanda arquivada pergunta o destino (não apaga)", A, async () => {
    // arquiva a demanda que está na coluna extra para testar o caso
    const ext = await db.column.findFirst({ where: { boardId, name: "E2E Revisada" } });
    const quick = await db.card.findFirst({ where: { boardId, title: t3 } });
    await db.card.update({ where: { id: quick!.id }, data: { columnId: ext!.id, archivedAt: new Date() } });
    await A.reload();
    const col = A.getByRole("region", { name: "Coluna E2E Revisada" });
    await col.getByRole("button", { name: "Opções da coluna" }).click();
    await A.getByRole("button", { name: "Excluir coluna" }).click();
    await A.getByRole("dialog", { name: "Excluir coluna?" }).getByRole("button", { name: "Excluir" }).click();
    const dlg = A.getByRole("dialog", { name: /Excluir a coluna/ });
    await dlg.waitFor();
    await dlg.getByRole("button", { name: /A fazer/ }).click();
    await dlg.getByRole("button", { name: "Mover e excluir" }).click();
    await waitFor(() => db.column.count({ where: { id: ext!.id } }), (n) => n === 0, "coluna não foi excluída");
    const kept = await db.card.findUnique({ where: { id: quick!.id }, include: { column: true } });
    expect(kept?.column.name === "A fazer", "a demanda arquivada se perdeu");
    await db.card.update({ where: { id: quick!.id }, data: { archivedAt: null } });
  });

  await step("24. Arquivar e restaurar o quadro (admin)", A, async () => {
    await A.goto(boardUrl);
    await A.getByRole("button", { name: "Opções do quadro" }).click();
    await A.getByRole("button", { name: "Arquivar quadro" }).click();
    await A.getByRole("dialog", { name: "Arquivar quadro?" }).getByRole("button", { name: "Arquivar" }).click();
    await A.waitForURL(`${BASE}/quadros`);
    await A.locator("div", { hasText: boardName }).getByRole("button", { name: "Restaurar" }).last().click();
    await waitFor(() => db.board.findUnique({ where: { id: boardId } }), (b) => !b?.archivedAt, "quadro não foi restaurado");
  });

  // ---------------------------------------------------------------- 8. telas de resumo
  await step("25. Início, Agenda e Cliente mostram as demandas", B, async () => {
    await B.goto(`${BASE}/`);
    await B.getByText(`${TAG} Vídeo institucional`).first().waitFor();
    await B.goto(`${BASE}/agenda`);
    await B.getByText(`${TAG} Vídeo institucional`).first().waitFor();
    await B.goto(`${BASE}/clientes/${created.clients[0]}`);
    await B.getByText(t2).first().waitFor();
  });

  await step("26. Configurações: pessoa nova, etiqueta, modelos, marca e registro", A, async () => {
    await A.goto(`${BASE}/configuracoes`);
    await A.getByRole("button", { name: "Adicionar pessoa" }).click();
    const dlg = A.getByRole("dialog", { name: "Adicionar pessoa" });
    await dlg.getByLabel("Nome").fill(`${TAG} Pessoa`);
    await dlg.getByLabel("E-mail").fill(`e2e-${Date.now()}@exemplo.test`);
    await dlg.getByRole("button", { name: "Criar acesso" }).click();
    await A.getByRole("dialog", { name: "Acesso criado" }).waitFor();
    const u = await db.user.findFirst({ where: { name: `${TAG} Pessoa` } });
    expect(u?.mustChangePassword, "pessoa nova sem troca de senha obrigatória");
    created.users.push(u!.id);
    await A.getByRole("button", { name: "Pronto" }).click();
    await A.getByRole("button", { name: `Editar ${TAG} Pessoa` }).click();
    await A.getByText("Acesso ativo").click();
    await A.getByRole("button", { name: "Salvar" }).click();
    await waitFor(() => db.user.findUnique({ where: { id: u!.id } }), (x) => x?.active === false, "não desativou");
    await A.getByRole("button", { name: /Etiquetas/ }).first().click();
    await A.getByText(`${TAG} Urgente`).first().waitFor();
    await A.getByRole("button", { name: /Modelos/ }).first().click();
    await A.getByText(`${TAG} Modelo banner`).waitFor();
    await A.getByRole("button", { name: /Marca/ }).first().click();
    await A.getByText("Construção do logotipo").waitFor();
    await A.getByRole("button", { name: /Registro/ }).first().click();
    await A.getByText("Cadastrou pessoa").first().waitFor();
  });

  await step("27. Perfil: trocar senha com senha atual errada mostra erro", A, async () => {
    await A.goto(`${BASE}/perfil`);
    await A.locator('input[name="current"]').fill("nao-e-a-senha");
    await A.locator('input[name="password"]').fill("novasenha123");
    await A.locator('input[name="confirm"]').fill("novasenha123");
    await A.getByRole("button", { name: "Trocar senha" }).click();
    await A.getByText("Senha atual incorreta.").waitFor();
  });

  await step("27b. Mover para outra coluna pelo menu do card e arquivar todas", A, async () => {
    await A.goto(boardUrl);
    const tile = A.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t2}`) });
    await tile.hover();
    await tile.getByRole("button", { name: "Ações da demanda" }).click();
    await A.getByRole("button", { name: "Concluído" }).click();
    await waitFor(() => cardByTitle(t2), (c) => c?.column.name === "Concluído" && Boolean(c.completedAt), "Mover para não levou/concluiu");
    const col = A.getByRole("region", { name: "Coluna Concluído" });
    await col.getByRole("button", { name: "Opções da coluna" }).click();
    await A.getByRole("button", { name: "Arquivar todas as demandas" }).click();
    await A.getByRole("dialog", { name: /Arquivar \d+/ }).getByRole("button", { name: "Arquivar" }).click();
    await waitFor(() => cardByTitle(t2), (c) => Boolean(c?.archivedAt), "Arquivar todas não arquivou");
  });

  await step("27c. Duplicar quadro e salvar como modelo de quadro", A, async () => {
    await A.getByRole("button", { name: "Opções do quadro" }).click();
    await A.getByRole("button", { name: "Duplicar quadro" }).click();
    await A.getByRole("dialog", { name: "Duplicar quadro" }).getByRole("button", { name: "Duplicar" }).click();
    await A.waitForURL((u) => u.pathname.startsWith("/quadros/") && !u.pathname.endsWith(boardId), { timeout: 10000 });
    const copyId = A.url().split("?")[0].split("/").pop()!;
    created.boards.push(copyId);
    const n = await db.card.count({ where: { boardId: copyId } });
    expect(n >= 3, `cópia do quadro com ${n} demandas`);
    await A.getByRole("button", { name: "Opções do quadro" }).click();
    await A.getByRole("button", { name: "Salvar como modelo" }).click();
    await A.getByRole("dialog", { name: "Salvar como modelo de quadro" }).getByRole("button", { name: "Salvar modelo" }).click();
    const tpl = await waitFor(() => db.boardTemplate.findFirst({ where: { name: { startsWith: TAG } } }), Boolean, "modelo de quadro não gravou");
    created.boardTemplates.push(tpl!.id);
    await A.goto(`${BASE}/quadros`);
    await A.getByRole("button", { name: "Novo quadro" }).first().click();
    const dlg = A.getByRole("dialog", { name: "Novo quadro" });
    await dlg.getByLabel("Nome").fill(`${TAG} Do modelo`);
    await dlg.getByRole("button", { name: new RegExp(tpl!.name.replace(/[()]/g, ".")) }).click();
    await dlg.getByRole("button", { name: "Criar quadro" }).click();
    await A.waitForURL(/\/quadros\/[a-z0-9]+/);
    const fromTpl = A.url().split("?")[0].split("/").pop()!;
    created.boards.push(fromTpl);
    const cols = await db.column.count({ where: { boardId: fromTpl } });
    expect(cols >= 4, `quadro do modelo com ${cols} colunas`);
  });

  await step("27d. Cor do sistema: escolher, salvar e voltar ao padrão", A, async () => {
    await A.goto(`${BASE}/perfil`);
    await A.getByRole("button", { name: "Rosa" }).click();
    await A.getByRole("button", { name: "Salvar cor" }).click();
    await waitFor(() => db.user.findUnique({ where: { email: "admin@demanda.local" } }), (u) => u?.accentColor === "#E0457B", "cor do sistema não gravou");
    await A.reload();
    const accent = await A.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toLowerCase());
    expect(accent === "#e0457b", `cor não aplicada depois de recarregar (${accent})`);
    await A.getByRole("button", { name: "Voltar ao padrão" }).click();
    await waitFor(() => db.user.findUnique({ where: { email: "admin@demanda.local" } }), (u) => u?.accentColor === null, "não voltou ao padrão");
  });

  await step("28. Celular: menu no topo, quadro e janela da demanda", null, async () => {
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
    ctxM.setDefaultTimeout(8000);
    const M = await login(ctxM, "admin@demanda.local");
    await M.getByRole("button", { name: "Abrir menu" }).click();
    await M.getByRole("link", { name: "Quadros" }).click();
    await M.goto(boardUrl);
    await M.getByRole("region", { name: "Coluna A fazer" }).waitFor();
    await M.getByRole("tablist", { name: "Colunas" }).getByRole("tab", { name: /Fazendo/ }).tap();
    await M.waitForTimeout(700);
    expect((await M.getByRole("tablist", { name: "Colunas" }).getByRole("tab", { name: /Fazendo/ }).getAttribute("aria-selected")) === "true", "aba da coluna não ficou ativa");
    const overflow = await M.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 1, `página rola para o lado no celular (${overflow}px)`);
    await M.getByRole("button", { name: new RegExp(`Demanda #\\d+: ${t3}`) }).tap();
    await M.getByRole("dialog", { name: "Demanda" }).waitFor();
    await M.screenshot({ path: path.join(SHOTS, "celular-demanda.png") });
    await ctxM.close();
  });

  await step("29. Tema escuro e sair", A, async () => {
    await A.goto(`${BASE}/`);
    await A.getByRole("button", { name: "Tema" }).first().click();
    await A.getByRole("button", { name: "Escuro" }).click();
    expect((await A.evaluate(() => document.documentElement.dataset.theme)) === "dark", "tema escuro não aplicou");
    await A.getByRole("button", { name: "Tema" }).first().click();
    await A.getByRole("button", { name: "Igual ao sistema" }).click();
    await A.getByRole("button", { name: "Minha conta" }).last().click();
    await A.getByRole("button", { name: "Sair" }).click();
    await A.waitForURL(/\/login/);
  });

  if (consoleErrors.length) {
    results.push({ step: "Console sem erros", ok: false, ms: 0, error: [...new Set(consoleErrors)].slice(0, 5).join(" | ") });
    console.log(`  ✗ Console sem erros: ${[...new Set(consoleErrors)].slice(0, 5).join(" | ")}`);
  } else {
    results.push({ step: "Console sem erros", ok: true, ms: 0 });
    console.log("  ✓ Console sem erros");
  }
  await browser.close();
}

/** Apaga só o que a simulação criou, pelos ids anotados. */
async function cleanup() {
  const files = await db.attachment.findMany({ where: { card: { boardId: { in: created.boards } } }, select: { storedName: true } });
  if (created.boards.length) await db.board.deleteMany({ where: { id: { in: created.boards } } });
  for (const f of files) fs.rmSync(path.join(process.cwd(), "storage", f.storedName), { force: true });
  if (created.templates.length) await db.cardTemplate.deleteMany({ where: { id: { in: created.templates } } });
  if (created.boardTemplates.length) await db.boardTemplate.deleteMany({ where: { id: { in: created.boardTemplates } } });
  await db.user.update({ where: { email: "admin@demanda.local" }, data: { accentColor: null } }).catch(() => {});
  if (created.labels.length) await db.label.deleteMany({ where: { id: { in: created.labels } } });
  if (created.clients.length) await db.client.deleteMany({ where: { id: { in: created.clients } } });
  if (created.users.length) await db.user.deleteMany({ where: { id: { in: created.users } } });
  // registros de auditoria gerados pela simulação (ids conferidos um a um pelo autor e horário)
  const demo = await db.user.findMany({ where: { email: { in: ["admin@demanda.local", "ana@demanda.local"] } }, select: { id: true } });
  const logs = await db.auditLog.findMany({ where: { createdAt: { gte: startedAt }, actorId: { in: [...demo.map((d) => d.id), ...created.users] } }, select: { id: true } });
  if (logs.length) await db.auditLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
  console.log(`\nLimpeza: ${created.boards.length} quadro, ${created.clients.length} cliente, ${created.labels.length} etiqueta, ${created.templates.length} modelo, ${created.users.length} pessoa, ${logs.length} registros, ${files.length} arquivo(s).`);
}

main()
  .catch((e) => {
    console.error("Falha geral:", e);
    results.push({ step: "execução", ok: false, ms: 0, error: String(e) });
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("Falha na limpeza:", e));
    await db.$disconnect();
    const ok = results.filter((r) => r.ok).length;
    console.log(`\nResultado: ${ok}/${results.length} etapas ok`);
    fs.writeFileSync(path.join(SHOTS, "resultado.json"), JSON.stringify(results, null, 2));
    process.exit(ok === results.length ? 0 : 1);
  });
