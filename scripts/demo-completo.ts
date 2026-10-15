// Demonstração completa: acrescenta pessoas, clientes, pastas, quadros e muitas demandas ao seed básico.
// Rodar depois do seed: npx tsx --env-file=.env scripts/demo-completo.ts
// Roda uma vez só (marca "demoCompletoAt" em AppSetting). Tudo é fictício.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";

const db = new PrismaClient();
const MARK = "demoCompletoAt";

const rich = (text: string) =>
  text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
const day = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);

type C = {
  t: string; d?: string; p?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; due?: number; start?: number; who?: string[]; tags?: string[]; client?: string;
  check?: [string, boolean][]; com?: [string, string][]; cover?: string; repeat?: "DAILY" | "WEEKLY" | "MONTHLY"; est?: number; time?: [string, number][]; arch?: boolean;
};
type Col = { name: string; color?: string; done?: boolean; wip?: number; cards: C[] };

async function main() {
  if (await db.appSetting.findUnique({ where: { key: MARK } })) return console.log("A demonstração completa já foi aplicada.");
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@demanda.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("Defina SEED_ADMIN_PASSWORD no .env (as pessoas novas usam a mesma senha).");

  // ---------- pessoas ----------
  const byEmail = async (email: string) => (await db.user.findUnique({ where: { email } }))!;
  const admin = await byEmail(adminEmail);
  const [ana, bruno, carla, diego] = await Promise.all(["ana", "bruno", "carla", "diego"].map((n) => byEmail(`${n}@demanda.local`)));
  if (!admin || !ana || !bruno || !carla || !diego) throw new Error("Rode o seed básico antes (npm run db:seed).");
  const pwd = hashPassword(password);
  const novo = async (name: string, email: string, color: string) => db.user.create({ data: { name, email, color, role: "MEMBER", passwordHash: pwd } });
  const eduarda = await novo("Eduarda Alves", "eduarda@demanda.local", "#C2185B");
  const fabio = await novo("Fábio Nunes", "fabio@demanda.local", "#2F6FDB");
  const gabi = await novo("Gabriela Rocha", "gabriela@demanda.local", "#F28C28");
  const heitor = await novo("Heitor Prado", "heitor@demanda.local", "#5B4FD6");
  const P: Record<string, string> = { admin: admin.id, ana: ana.id, bruno: bruno.id, carla: carla.id, diego: diego.id, eduarda: eduarda.id, fabio: fabio.id, gabi: gabi.id, heitor: heitor.id };
  const NAME: Record<string, string> = { admin: admin.name, ana: ana.name, bruno: bruno.name, carla: carla.name, diego: diego.name, eduarda: eduarda.name, fabio: fabio.name, gabi: gabi.name, heitor: heitor.name };

  // ---------- etiquetas ----------
  const labels = Object.fromEntries((await db.label.findMany()).map((l) => [l.name, l.id]));
  let lp = Object.keys(labels).length;
  for (const [name, color] of [["Anúncio", "#F28C28"], ["E-mail", "#5B4FD6"], ["Blog", "#2F6FDB"], ["Design", "#C2185B"], ["Stories", "#E0457B"], ["Aprovação", "#F2B705"]] as const) {
    labels[name] = (await db.label.create({ data: { name, color, position: lp++ } })).id;
  }

  // ---------- clientes ----------
  const clients = Object.fromEntries((await db.client.findMany()).map((c) => [c.name, c.id]));
  for (const [name, contact, color, notes] of [
    ["Bella Massa Pizzaria", "Rodrigo", "#F0654A", "Rede com 3 lojas. Foco em delivery à noite."],
    ["Clínica Sorriso Leve", "Dra. Paula", "#2F6FDB", "Odontologia estética. Tudo passa pela aprovação da Dra. Paula."],
    ["Studio Movimento", "Júlia", "#8E44AD", "Estúdio de pilates e funcional. Público de 25 a 45 anos."],
    ["Café Grão Nobre", "André", "#8A6D3B", "Cafeteria de especialidade. Lançando loja on-line."],
    ["Lar Imóveis", "Sérgio", "#1F8FA8", "Imobiliária. Anúncios de lançamentos e captação."],
    ["Escola Aprender+", "Renata", "#F28C28", "Escola de reforço. Campanha de matrículas em janeiro."],
  ] as const) {
    clients[name] = (await db.client.create({ data: { name, contact, color, notes } })).id;
  }

  // ---------- pastas ----------
  const folder = async (name: string, color: string, position: number) => (await db.boardFolder.create({ data: { name, color, position } })).id;
  const fClientes = await folder("Clientes", "#2F6FDB", 1);
  const fProducao = await folder("Produção", "#19C9A9", 2);
  const fAgencia = await folder("Agência", "#5B7F7A", 3);

  let number = ((await db.card.aggregate({ _max: { number: true } }))._max.number ?? 0);
  const allUsers = Object.values(P);
  let created = 0;

  async function addCards(boardId: string, colId: string, colName: string, isDone: boolean, cards: C[], prevCol: string | null) {
    const start = await db.card.count({ where: { columnId: colId } });
    for (const [i, s] of cards.entries()) {
      number++;
      created++;
      const createdHoursAgo = 24 * (3 + ((number * 7) % 12));
      const card = await db.card.create({
        data: {
          number,
          title: s.t,
          description: s.d ? rich(s.d) : undefined,
          priority: s.p,
          dueDate: s.due !== undefined ? day(s.due) : null,
          startDate: s.start !== undefined ? day(s.start) : null,
          completedAt: isDone ? ago(10 + i * 19) : null,
          archivedAt: s.arch ? ago(30) : null,
          coverColor: s.cover,
          repeatEvery: s.repeat,
          estimatedMin: s.est,
          position: start + i,
          boardId,
          columnId: colId,
          createdById: P.admin,
          clientId: s.client ? clients[s.client] : null,
          createdAt: ago(createdHoursAgo),
          assignees: { create: (s.who ?? []).map((w) => ({ userId: P[w] })) },
          labels: { create: (s.tags ?? []).map((t) => ({ labelId: labels[t] })) },
          checklists: s.check ? { create: { title: "Checklist", items: { create: s.check.map(([text, done], k) => ({ text, done, position: k })) } } } : undefined,
        },
      });
      // histórico: criou, foi para a coluna atual, responsáveis e conclusão
      const acts: { type: string; data: Record<string, string>; at: Date; user: string }[] = [
        { type: "created", data: { column: prevCol ?? colName }, at: ago(createdHoursAgo), user: P.admin },
      ];
      for (const w of s.who ?? []) acts.push({ type: "assigned", data: { name: NAME[w] }, at: ago(createdHoursAgo - 1), user: P.admin });
      if (s.client) acts.push({ type: "client", data: { name: s.client }, at: ago(createdHoursAgo - 1), user: P.admin });
      if (prevCol) acts.push({ type: "moved", data: { from: prevCol, to: colName }, at: ago(Math.max(2, createdHoursAgo / 3)), user: P[(s.who ?? ["admin"])[0]] });
      if (isDone) acts.push({ type: "completed", data: {}, at: ago(10 + i * 19), user: P[(s.who ?? ["admin"])[0]] });
      await db.activity.createMany({ data: acts.map((a) => ({ cardId: card.id, userId: a.user, type: a.type, data: JSON.stringify(a.data), createdAt: a.at })) });
      for (const [k, [w, body]] of (s.com ?? []).entries()) {
        await db.comment.create({ data: { cardId: card.id, userId: P[w], body: rich(body), createdAt: ago(Math.max(1, createdHoursAgo / 4 - k * 3)) } });
      }
      for (const [k, [w, min]] of (s.time ?? []).entries()) {
        const begin = ago(24 * (k + 1) + 5);
        await db.timeEntry.create({ data: { cardId: card.id, userId: P[w], startedAt: begin, endedAt: new Date(begin.getTime() + min * 60_000) } });
      }
    }
  }

  async function board(name: string, color: string, description: string, folderId: string | null, client: string | null, cols: Col[]) {
    const last = await db.board.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const b = await db.board.create({
      data: { name, color, description, folderId, clientId: client ? clients[client] : null, position: (last?.position ?? 0) + 1, favorites: { create: [{ userId: P.admin }] } },
    });
    let prev: string | null = null;
    for (const [ci, col] of cols.entries()) {
      const c = await db.column.create({ data: { boardId: b.id, name: col.name, color: col.color ?? null, isDone: col.done ?? false, wipLimit: col.wip ?? 0, position: ci } });
      await addCards(b.id, c.id, col.name, Boolean(col.done), col.cards, ci > 0 ? prev : null);
      prev = col.name;
    }
    return b.id;
  }

  async function addToExisting(boardName: string, colName: string, cards: C[], prevCol: string | null) {
    const b = await db.board.findFirst({ where: { name: boardName } });
    if (!b) return;
    const c = await db.column.findFirst({ where: { boardId: b.id, name: colName } });
    if (!c) return;
    await addCards(b.id, c.id, colName, c.isDone, cards, prevCol);
  }

  // ---------- quadros que já existem: mais demandas, cores e pastas ----------
  const social = await db.board.findFirst({ where: { name: "Social media" } });
  const siteAurora = await db.board.findFirst({ where: { name: "Site Aurora" } });
  const semana = await db.board.findFirst({ where: { name: "Semana da equipe" } });
  if (social) await db.board.update({ where: { id: social.id }, data: { folderId: fProducao } });
  if (siteAurora) await db.board.update({ where: { id: siteAurora.id }, data: { folderId: fClientes, clientId: clients["Aurora Cosméticos"] ?? null } });
  if (semana) await db.board.update({ where: { id: semana.id }, data: { folderId: fAgencia } });

  await addToExisting("Social media", "Ideias", [
    { t: "Trend da semana adaptada para a Aurora", tags: ["Instagram", "Cliente Aurora"], who: ["carla"], client: "Aurora Cosméticos" },
    { t: "Série de antes e depois para a Clínica Sorriso Leve", tags: ["Instagram", "Stories"], client: "Clínica Sorriso Leve", p: "LOW" },
    { t: "Enquete nos stories: sabor da semana", tags: ["Stories"], client: "Bella Massa Pizzaria", who: ["gabi"] },
  ], null);
  await addToExisting("Social media", "Produção", [
    { t: "Carrossel: 3 exercícios para fazer em casa", tags: ["Instagram", "Design"], client: "Studio Movimento", who: ["eduarda"], p: "MEDIUM", due: 1, est: 90,
      check: [["Roteiro dos slides", true], ["Fotos do estúdio", true], ["Diagramação", false], ["Legenda", false]], time: [["eduarda", 75]] },
    { t: "Reel do novo cardápio de inverno", tags: ["Vídeo", "Instagram"], client: "Bella Massa Pizzaria", who: ["fabio", "eduarda"], p: "HIGH", due: 2, start: -1, cover: "#F0654A",
      com: [["fabio", "Gravei as cenas ontem na loja do centro. Subindo o material na pasta."], ["eduarda", "@Fábio Nunes vou fazer as artes de abertura com a paleta nova."]] },
    { t: "Stories da semana do café coado", tags: ["Stories"], client: "Café Grão Nobre", who: ["carla"], due: 0, est: 45 },
  ], "Briefing");
  await addToExisting("Social media", "Aprovação do cliente", [
    { t: "Post de Dia das Crianças", tags: ["Instagram", "Aprovação"], client: "Escola Aprender+", who: ["carla"], due: 1, p: "HIGH",
      com: [["gabi", "Enviei para a Renata às 10h. Ela pediu para responder até amanhã."]] },
    { t: "Carrossel de lançamento: Edifício Jardins", tags: ["Instagram", "Aprovação"], client: "Lar Imóveis", who: ["eduarda"], due: 3 },
  ], "Revisão interna");
  await addToExisting("Social media", "Publicado", [
    { t: "Reel: um dia no estúdio", tags: ["Vídeo"], client: "Studio Movimento", who: ["fabio"], due: -2 },
    { t: "Carrossel de dicas de clareamento", tags: ["Instagram"], client: "Clínica Sorriso Leve", who: ["eduarda", "carla"], due: -4 },
    { t: "Post do rodízio de sexta", tags: ["Instagram"], client: "Bella Massa Pizzaria", who: ["carla"], due: -6 },
    { t: "Campanha antiga de inverno", tags: ["Instagram"], client: "Aurora Cosméticos", who: ["ana"], due: -40, arch: true },
  ], "Aprovação do cliente");
  await addToExisting("Site Aurora", "A fazer", [
    { t: "Página de produtos com filtro por linha", tags: ["Site", "Cliente Aurora"], client: "Aurora Cosméticos", who: ["bruno"], due: 12, p: "MEDIUM", est: 360 },
    { t: "Configurar Google Analytics e eventos", tags: ["Site"], client: "Aurora Cosméticos", who: ["heitor"], due: 14 },
  ], null);
  await addToExisting("Site Aurora", "Fazendo", [
    { t: "Banco de imagens das linhas de produto", tags: ["Design", "Site"], client: "Aurora Cosméticos", who: ["eduarda"], due: 4, start: -1, check: [["Linha corpo", true], ["Linha rosto", false], ["Linha cabelo", false]], time: [["eduarda", 120], ["eduarda", 60]] },
  ], "A fazer");
  await addToExisting("Site Aurora", "Concluído", [
    { t: "Wireframe aprovado pela Marina", tags: ["Site", "Aprovação"], client: "Aurora Cosméticos", who: ["ana"], due: -3 },
    { t: "Escolha do domínio e da hospedagem", tags: ["Site"], who: ["bruno"], due: -6 },
  ], "Revisão");
  await addToExisting("Semana da equipe", "Esta semana", [
    { t: "Reunião de pauta de novembro", tags: ["Interno"], who: ["admin", "carla", "gabi"], due: 2, p: "MEDIUM", check: [["Levantar datas comemorativas", true], ["Puxar números de outubro", false], ["Montar apresentação", false]] },
    { t: "Atualizar o modelo de relatório", tags: ["Interno", "Design"], who: ["eduarda"], due: 4 },
  ], "Backlog");
  await addToExisting("Semana da equipe", "Feito", [
    { t: "Onboarding da Eduarda", tags: ["Interno"], who: ["admin", "eduarda"], due: -5 },
    { t: "Renovar licenças do pacote de design", tags: ["Interno"], who: ["admin"], due: -2 },
    { t: "Backup mensal das pastas de clientes", tags: ["Interno"], who: ["bruno"], due: -1, repeat: "MONTHLY" },
  ], "Em andamento");

  // ---------- quadros novos ----------
  await board("Tráfego pago", "#F28C28", "Campanhas de anúncios no Instagram e no Google, do plano ao relatório.", fProducao, null, [
    { name: "Planejamento", color: "#5B7F7A", cards: [
      { t: "Plano de mídia de novembro: Bella Massa", tags: ["Anúncio"], client: "Bella Massa Pizzaria", who: ["heitor"], due: 5, p: "MEDIUM", est: 120,
        check: [["Verba por loja", true], ["Públicos por bairro", false], ["Calendário de ofertas", false]] },
      { t: "Público de matrículas para a Aprender+", tags: ["Anúncio"], client: "Escola Aprender+", who: ["heitor"], due: 9 },
      { t: "Teste de anúncio em vídeo curto", tags: ["Anúncio", "Vídeo"], client: "Studio Movimento", p: "LOW" },
    ] },
    { name: "Criação", color: "#2F6FDB", wip: 4, cards: [
      { t: "Criativos da campanha de lançamento Jardins", tags: ["Anúncio", "Design"], client: "Lar Imóveis", who: ["eduarda", "heitor"], due: 1, p: "HIGH", cover: "#1F8FA8",
        check: [["3 formatos de imagem", true], ["2 vídeos de 15s", false], ["Textos dos anúncios", true]],
        com: [["heitor", "@Eduarda Alves precisamos da versão 4:5 também, rende mais no feed."], ["eduarda", "Fechado, mando ainda hoje."]] },
      { t: "Anúncio de delivery para a noite de sexta", tags: ["Anúncio"], client: "Bella Massa Pizzaria", who: ["eduarda"], due: 0, p: "URGENT", est: 60 },
    ] },
    { name: "No ar", color: "#F28C28", cards: [
      { t: "Campanha: avaliação gratuita", tags: ["Anúncio"], client: "Clínica Sorriso Leve", who: ["heitor"], start: -6, due: 8, d: "Verba: R$ 1.500 no mês.\nMeta: 40 agendamentos.\nAcompanhar custo por agendamento toda segunda.",
        com: [["heitor", "Semana 1 fechou com 14 agendamentos. Custo dentro do previsto."]], time: [["heitor", 40], ["heitor", 35]] },
      { t: "Remarketing para quem visitou o site", tags: ["Anúncio", "Site"], client: "Aurora Cosméticos", who: ["heitor"], start: -10, due: 20 },
    ] },
    { name: "Otimização", color: "#8E44AD", cards: [
      { t: "Trocar criativos com baixo clique", tags: ["Anúncio", "Design"], client: "Studio Movimento", who: ["heitor", "eduarda"], due: -1, p: "HIGH" },
    ] },
    { name: "Relatório enviado", color: "#1E7F4F", done: true, cards: [
      { t: "Relatório de setembro: Clínica Sorriso Leve", tags: ["Anúncio"], client: "Clínica Sorriso Leve", who: ["heitor"], due: -8 },
      { t: "Relatório de setembro: Bella Massa", tags: ["Anúncio"], client: "Bella Massa Pizzaria", who: ["heitor", "gabi"], due: -8 },
    ] },
  ]);

  await board("Vídeos e reels", "#C2185B", "Do roteiro à entrega: gravação, edição e revisão de vídeos.", fProducao, null, [
    { name: "Roteiro", color: "#5B4FD6", cards: [
      { t: "Roteiro: tour pelo apartamento decorado", tags: ["Vídeo", "Texto"], client: "Lar Imóveis", who: ["bruno"], due: 3, est: 60 },
      { t: "Roteiro: como é a primeira aula", tags: ["Vídeo", "Texto"], client: "Studio Movimento", who: ["bruno", "fabio"], due: 6 },
    ] },
    { name: "Gravação", color: "#E0457B", cards: [
      { t: "Gravar depoimentos de alunos", tags: ["Vídeo"], client: "Escola Aprender+", who: ["fabio"], due: 2, start: 2, p: "MEDIUM",
        check: [["Autorização de imagem dos pais", true], ["Lista de perguntas", true], ["Agendar com a escola", false]] },
    ] },
    { name: "Edição", color: "#C2185B", wip: 3, cards: [
      { t: "Edição do vídeo institucional da clínica", tags: ["Vídeo"], client: "Clínica Sorriso Leve", who: ["fabio"], due: 1, start: -3, p: "HIGH", est: 480,
        check: [["Decupagem", true], ["Primeiro corte", true], ["Trilha e cor", false], ["Legendas", false]], time: [["fabio", 150], ["fabio", 120], ["fabio", 90]],
        com: [["fabio", "Primeiro corte pronto, 1min40. Vou mandar para revisão interna amanhã."]] },
      { t: "Reel da barista preparando o coado", tags: ["Vídeo", "Instagram"], client: "Café Grão Nobre", who: ["fabio"], due: 0 },
    ] },
    { name: "Revisão", color: "#F2B705", cards: [
      { t: "Vídeo de boas-vindas do site Aurora", tags: ["Vídeo", "Site"], client: "Aurora Cosméticos", who: ["fabio", "ana"], due: -2, p: "MEDIUM",
        com: [["ana", "Ficou ótimo. Só ajustar o logo no fim, está pequeno."]] },
    ] },
    { name: "Entregue", color: "#1E7F4F", done: true, cards: [
      { t: "Reel do aniversário da pizzaria", tags: ["Vídeo"], client: "Bella Massa Pizzaria", who: ["fabio"], due: -5 },
      { t: "Teaser do lançamento Jardins", tags: ["Vídeo"], client: "Lar Imóveis", who: ["fabio", "eduarda"], due: -9 },
    ] },
  ]);

  await board("Bella Massa Pizzaria", "#F0654A", "Conteúdo mensal das 3 lojas: pauta, produção e agendamento.", fClientes, "Bella Massa Pizzaria", [
    { name: "Pauta do mês", color: "#8A6D3B", cards: [
      { t: "Post: noite da pizza doce", tags: ["Instagram"], client: "Bella Massa Pizzaria", who: ["carla"], due: 7 },
      { t: "Stories: bastidores da massa artesanal", tags: ["Stories"], client: "Bella Massa Pizzaria", who: ["fabio"], due: 9 },
      { t: "Promoção do Dia do Cliente", tags: ["Instagram", "Anúncio"], client: "Bella Massa Pizzaria", p: "MEDIUM", due: 12 },
    ] },
    { name: "Produção", color: "#F0654A", cards: [
      { t: "Arte do combo família", tags: ["Instagram", "Design"], client: "Bella Massa Pizzaria", who: ["eduarda"], due: 1, est: 60, check: [["Foto do produto", true], ["Arte", false], ["Legenda", false]] },
      { t: "Legendas da semana", tags: ["Texto"], client: "Bella Massa Pizzaria", who: ["bruno"], due: 0, repeat: "WEEKLY", est: 45 },
    ] },
    { name: "Aprovação", color: "#F2B705", cards: [
      { t: "Cardápio de inverno: 4 posts", tags: ["Instagram", "Aprovação"], client: "Bella Massa Pizzaria", who: ["carla", "gabi"], due: -1, p: "HIGH",
        com: [["gabi", "O Rodrigo pediu para trocar a foto da calabresa. Já pedi ao Fábio."], ["admin", "@Gabriela Rocha boa. Segura a publicação até chegar a foto nova."]] },
    ] },
    { name: "Agendado", color: "#2F6FDB", cards: [
      { t: "Post de segunda: pizza da semana", tags: ["Instagram"], client: "Bella Massa Pizzaria", who: ["carla"], due: 3 },
    ] },
    { name: "Publicado", color: "#1E7F4F", done: true, cards: [
      { t: "Post de lançamento da loja 3", tags: ["Instagram"], client: "Bella Massa Pizzaria", who: ["carla", "eduarda"], due: -10 },
      { t: "Stories do sorteio de outubro", tags: ["Stories"], client: "Bella Massa Pizzaria", who: ["carla"], due: -3 },
    ] },
  ]);

  await board("Clínica Sorriso Leve", "#2F6FDB", "Site novo, conteúdo e campanhas da clínica.", fClientes, "Clínica Sorriso Leve", [
    { name: "A fazer", color: "#5B7F7A", cards: [
      { t: "Página de tratamentos com preços", tags: ["Site"], client: "Clínica Sorriso Leve", who: ["bruno"], due: 10, p: "MEDIUM" },
      { t: "E-mail de lembrete de retorno", tags: ["E-mail"], client: "Clínica Sorriso Leve", who: ["gabi"], due: 8 },
    ] },
    { name: "Fazendo", color: "#2F6FDB", cards: [
      { t: "Site: agendamento pelo WhatsApp", tags: ["Site"], client: "Clínica Sorriso Leve", who: ["bruno", "ana"], due: 2, start: -2, p: "HIGH", est: 240,
        check: [["Botão fixo no celular", true], ["Mensagem pronta", true], ["Testar nos 3 números", false]], time: [["bruno", 90]] },
      { t: "Blog: 5 mitos sobre clareamento", tags: ["Blog", "Texto"], client: "Clínica Sorriso Leve", who: ["bruno"], due: 4 },
    ] },
    { name: "Aguardando cliente", color: "#F2B705", cards: [
      { t: "Fotos da equipe para o site", tags: ["Design", "Site"], client: "Clínica Sorriso Leve", who: ["gabi"], due: -3, p: "MEDIUM",
        com: [["gabi", "A Dra. Paula vai mandar até sexta. Cobrei de novo hoje."]] },
    ] },
    { name: "Concluído", color: "#1E7F4F", done: true, cards: [
      { t: "Identidade visual dos posts", tags: ["Design"], client: "Clínica Sorriso Leve", who: ["eduarda"], due: -12 },
      { t: "Pesquisa de concorrentes da região", tags: ["Texto"], client: "Clínica Sorriso Leve", who: ["ana"], due: -15 },
    ] },
  ]);

  await board("Studio Movimento", "#8E44AD", "Social media e anúncios do estúdio de pilates.", fClientes, "Studio Movimento", [
    { name: "Ideias", color: "#9ADBC5", cards: [
      { t: "Desafio de 7 dias nos stories", tags: ["Stories"], client: "Studio Movimento", who: ["carla"] },
      { t: "Parceria com nutricionista", tags: ["Instagram"], client: "Studio Movimento", p: "LOW" },
    ] },
    { name: "Produção", color: "#8E44AD", cards: [
      { t: "Carrossel: pilates para iniciantes", tags: ["Instagram", "Design"], client: "Studio Movimento", who: ["eduarda"], due: 2, est: 90 },
      { t: "Reels de exercícios rápidos", tags: ["Vídeo"], client: "Studio Movimento", who: ["fabio"], due: 5, repeat: "WEEKLY" },
    ] },
    { name: "Aprovação", color: "#F2B705", cards: [
      { t: "Campanha de matrículas de novembro", tags: ["Anúncio", "Aprovação"], client: "Studio Movimento", who: ["heitor", "gabi"], due: 1, p: "HIGH" },
    ] },
    { name: "Publicado", color: "#1E7F4F", done: true, cards: [
      { t: "Post de boas-vindas aos alunos novos", tags: ["Instagram"], client: "Studio Movimento", who: ["carla"], due: -6 },
    ] },
  ]);

  await board("Comercial", "#5B4FD6", "Novos clientes: do primeiro contato ao contrato assinado.", fAgencia, null, [
    { name: "Contatos", color: "#5B7F7A", cards: [
      { t: "Restaurante Sabor da Serra: pediu orçamento", tags: ["Interno"], who: ["gabi"], due: 1, p: "MEDIUM" },
      { t: "Academia Força Total: indicação do Studio", tags: ["Interno"], who: ["gabi"], due: 3 },
    ] },
    { name: "Reunião marcada", color: "#2F6FDB", cards: [
      { t: "Ótica Visão Clara: reunião na quinta", tags: ["Interno"], who: ["admin", "gabi"], due: 4, check: [["Levantar o Instagram atual", true], ["Separar cases parecidos", false]] },
    ] },
    { name: "Proposta enviada", color: "#5B4FD6", cards: [
      { t: "Proposta: Pet Shop Amigo Fiel", tags: ["Texto"], who: ["admin"], due: 2, p: "HIGH", d: "Pacote: 12 posts por mês, stories e tráfego pago.\nValor enviado na proposta. Retorno combinado para sexta." },
    ] },
    { name: "Negociação", color: "#F28C28", cards: [
      { t: "Café Grão Nobre: incluir loja on-line no pacote", tags: ["Site"], client: "Café Grão Nobre", who: ["admin", "bruno"], due: 0, p: "URGENT",
        com: [["admin", "O André topou o pacote se o site entrar em 3 parcelas. @Bruno Lima me passa o prazo realista?"], ["bruno", "6 semanas com a loja integrada."]] },
    ] },
    { name: "Fechado", color: "#1E7F4F", done: true, cards: [
      { t: "Lar Imóveis: contrato de 12 meses", tags: ["Interno"], client: "Lar Imóveis", who: ["admin"], due: -20 },
      { t: "Escola Aprender+: campanha de matrículas", tags: ["Interno"], client: "Escola Aprender+", who: ["admin", "gabi"], due: -9 },
    ] },
  ]);

  await board("Café Grão Nobre", "#8A6D3B", "Loja on-line e conteúdo da cafeteria.", null, "Café Grão Nobre", [
    { name: "A fazer", color: "#5B7F7A", cards: [
      { t: "Fotos dos cafés para a loja on-line", tags: ["Design"], client: "Café Grão Nobre", who: ["fabio"], due: 6 },
      { t: "Textos dos produtos", tags: ["Texto"], client: "Café Grão Nobre", who: ["bruno"], due: 8 },
    ] },
    { name: "Fazendo", color: "#8A6D3B", cards: [
      { t: "Layout da loja on-line", tags: ["Site", "Design"], client: "Café Grão Nobre", who: ["ana"], due: 3, start: -2, p: "HIGH", est: 360, check: [["Página inicial", true], ["Página do produto", false], ["Carrinho", false]] },
    ] },
    { name: "Concluído", color: "#1E7F4F", done: true, cards: [
      { t: "Logo novo aplicado no Instagram", tags: ["Design", "Instagram"], client: "Café Grão Nobre", who: ["eduarda"], due: -4 },
    ] },
  ]);

  // ---------- favoritos de todo mundo nas pastas de produção ----------
  const trafego = await db.board.findFirst({ where: { name: "Tráfego pago" } });
  if (trafego) await db.boardFavorite.createMany({ data: allUsers.filter((u) => u !== P.admin).map((userId) => ({ userId, boardId: trafego.id })) });

  // ---------- notificações do admin ----------
  const card = async (title: string) => (await db.card.findFirst({ where: { title }, select: { id: true, number: true } }))!;
  const n1 = await card("Café Grão Nobre: incluir loja on-line no pacote");
  const n2 = await card("Cardápio de inverno: 4 posts");
  const n3 = await card("Campanha: avaliação gratuita");
  const n4 = await card("Edição do vídeo institucional da clínica");
  const n5 = await card("Reunião de pauta de novembro");
  await db.notification.createMany({
    data: [
      { userId: P.admin, actorId: P.bruno, cardId: n1.id, type: "COMMENT", text: `Bruno Lima comentou em #${n1.number} Café Grão Nobre: incluir loja on-line no pacote`, createdAt: ago(2) },
      { userId: P.admin, actorId: P.gabi, cardId: n2.id, type: "COMMENT", text: `Gabriela Rocha comentou em #${n2.number} Cardápio de inverno: 4 posts`, createdAt: ago(5) },
      { userId: P.admin, actorId: P.heitor, cardId: n3.id, type: "MOVED", text: `Heitor Prado moveu #${n3.number} Campanha: avaliação gratuita para No ar`, createdAt: ago(20), readAt: ago(18) },
      { userId: P.admin, actorId: P.fabio, cardId: n4.id, type: "COMMENT", text: `Fábio Nunes comentou em #${n4.number} Edição do vídeo institucional da clínica`, createdAt: ago(26), readAt: ago(25) },
      { userId: P.admin, actorId: P.carla, cardId: n5.id, type: "ASSIGNED", text: `Carla Mendes colocou você em #${n5.number} Reunião de pauta de novembro`, createdAt: ago(30) },
    ],
  });

  // ---------- modelos de demanda ----------
  await db.cardTemplate.createMany({
    data: [
      { name: "Post de Instagram", title: "Post: ", priority: "MEDIUM", estimatedMin: 90, createdById: P.admin, checklist: JSON.stringify(["Briefing", "Arte", "Legenda", "Aprovação do cliente", "Agendar"]), labelIds: JSON.stringify([labels["Instagram"]]) },
      { name: "Reel", title: "Reel: ", priority: "MEDIUM", estimatedMin: 240, createdById: P.admin, checklist: JSON.stringify(["Roteiro", "Gravação", "Edição", "Legendas", "Aprovação"]), labelIds: JSON.stringify([labels["Vídeo"]]) },
      { name: "Campanha de anúncio", title: "Campanha: ", priority: "HIGH", estimatedMin: 180, createdById: P.admin, checklist: JSON.stringify(["Público", "Criativos", "Textos", "Subir no gerenciador", "Relatório da semana 1"]), labelIds: JSON.stringify([labels["Anúncio"]]) },
    ],
  });

  await db.appSetting.create({ data: { key: MARK, value: new Date().toISOString() } });
  const total = await db.card.count();
  console.log(`Demonstração completa aplicada: +4 pessoas, +6 clientes, 3 pastas, +7 quadros, +${created} demandas (total ${total}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
