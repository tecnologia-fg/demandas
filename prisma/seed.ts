// Dados de demonstração. Rodar com: npm run db:reset
// Login do admin: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no .env (as outras pessoas usam a mesma senha).
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

/** Texto puro -> HTML do editor (parágrafos, quebras e links). */
function rich(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
}

function day(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@demanda.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("Defina SEED_ADMIN_PASSWORD (8+ caracteres) no .env");
  const pwd = hash(password);

  const people = [
    { name: "Rafael Lima", email, role: "ADMIN", color: "#34C38F" },
    { name: "Ana Souza", email: "ana@demanda.local", role: "MEMBER", color: "#6FE3CD" },
    { name: "Bruno Lima", email: "bruno@demanda.local", role: "MEMBER", color: "#155E75" },
    { name: "Carla Mendes", email: "carla@demanda.local", role: "MEMBER", color: "#0B9A82" },
    { name: "Diego Rocha", email: "diego@demanda.local", role: "MEMBER", color: "#1E7F4F" },
  ];
  const users: { id: string }[] = [];
  for (const p of people) users.push(await db.user.create({ data: { ...p, passwordHash: pwd } }));
  const [admin, ana, bruno, carla, diego] = users;

  const labelData = [
    ["Instagram", "#6FE3CD"],
    ["Site", "#155E75"],
    ["Vídeo", "#0E7C6B"],
    ["Texto", "#0F3B36"],
    ["Cliente Aurora", "#3BB3C3"],
    ["Cliente Vértice", "#34C38F"],
    ["Interno", "#5B7F7A"],
  ] as const;
  const labels: Record<string, string> = {};
  for (const [i, [name, color]] of labelData.entries()) labels[name] = (await db.label.create({ data: { name, color, position: i } })).id;

  const clientAurora = await db.client.create({ data: { name: "Aurora Cosméticos", contact: "Marina", color: "#3BB3C3" } });
  const clientVertice = await db.client.create({ data: { name: "Vértice Engenharia", contact: "Rafael", color: "#34C38F" } });
  const clientFor = (tags: string[] = []) => (tags.includes("Cliente Aurora") ? clientAurora.id : tags.includes("Cliente Vértice") ? clientVertice.id : null);

  let number = 0;
  type CardSeed = {
    title: string;
    description?: string;
    priority?: string;
    due?: number;
    start?: number;
    who?: string[];
    tags?: string[];
    checklist?: [string, boolean][];
    comments?: [string, string][];
    cover?: string;
    repeat?: string;
    estimate?: number;
  };

  async function board(name: string, color: string, description: string, fav: boolean, columns: { name: string; color?: string; isDone?: boolean; cards: CardSeed[] }[], position: number) {
    const b = await db.board.create({
      data: { name, color, description, position, favorites: fav ? { create: users.map((u) => ({ userId: u.id })) } : undefined },
    });
    for (const [ci, col] of columns.entries()) {
      const c = await db.column.create({ data: { boardId: b.id, name: col.name, color: col.color ?? null, isDone: col.isDone ?? false, position: ci } });
      for (const [i, s] of col.cards.entries()) {
        number++;
        const card = await db.card.create({
          data: {
            number,
            title: s.title,
            description: s.description ? rich(s.description) : undefined,
            priority: s.priority,
            dueDate: s.due !== undefined ? day(s.due) : null,
            startDate: s.start !== undefined ? day(s.start) : null,
            completedAt: col.isDone ? new Date(Date.now() - (i + 1) * 3600_000 * 20) : null,
            coverColor: s.cover,
            repeatEvery: s.repeat,
            estimatedMin: s.estimate,
            position: i,
            boardId: b.id,
            columnId: c.id,
            createdById: admin.id,
            clientId: clientFor(s.tags),
            assignees: { create: (s.who ?? []).map((userId) => ({ userId })) },
            labels: { create: (s.tags ?? []).map((t) => ({ labelId: labels[t] })) },
            checklists: s.checklist
              ? { create: { title: "Checklist", items: { create: s.checklist.map(([text, done], p) => ({ text, done, position: p })) } } }
              : undefined,
          },
        });
        await db.activity.create({ data: { cardId: card.id, userId: admin.id, type: "created", data: JSON.stringify({ column: col.name }), createdAt: new Date(Date.now() - 86400000 * 3) } });
        for (const [k, [userId, body]] of (s.comments ?? []).entries()) {
          await db.comment.create({ data: { cardId: card.id, userId, body: rich(body), createdAt: new Date(Date.now() - (5 - k) * 3600_000) } });
        }
      }
    }
  }

  await board(
    "Social media",
    "#6FE3CD",
    "Posts, stories e reels dos clientes, da ideia à publicação.",
    true,
    [
      {
        name: "Ideias",
        cards: [
          { title: "Série de bastidores para o Dia do Cliente", tags: ["Instagram", "Cliente Aurora"], who: [carla.id] },
          { title: "Reel com depoimentos curtos de clientes", tags: ["Vídeo", "Cliente Vértice"], priority: "LOW" },
          { title: "Carrossel: 5 erros comuns no primeiro site", tags: ["Instagram", "Texto"] },
        ],
      },
      {
        name: "Briefing",
        color: "#34C38F",
        cards: [
          {
            title: "Campanha de lançamento da coleção de verão",
            description: "Objetivo: gerar lista de espera.\nEntregas: 3 posts no feed, 6 stories, 1 reel.\nReferências: https://www.pinterest.com/",
            tags: ["Instagram", "Cliente Aurora"],
            priority: "HIGH",
            due: 2,
            who: [carla.id, ana.id],
            checklist: [["Reunião de alinhamento", true], ["Definir paleta da campanha", false], ["Aprovar cronograma com o cliente", false]],
            comments: [[carla.id, "Cliente pediu para evitar fundo branco nas artes."], [ana.id, "@Carla Mendes beleza, vou trabalhar com o areia da marca."]],
          },
        ],
      },
      {
        name: "Produção",
        color: "#155E75",
        cards: [
          { title: "Arte do post de aniversário da marca", tags: ["Instagram", "Cliente Vértice"], priority: "URGENT", due: -1, who: [ana.id], cover: "#34C38F", estimate: 120, checklist: [["Rascunho", true], ["Versão final", false]] },
          { title: "Legenda e hashtags da semana", tags: ["Texto"], due: 0, who: [bruno.id], repeat: "WEEKLY", estimate: 60 },
          { title: "Edição do reel da visita à fábrica", tags: ["Vídeo", "Cliente Aurora"], priority: "MEDIUM", due: 3, start: 0, who: [diego.id], checklist: [["Decupagem", true], ["Corte", true], ["Trilha e legendas", false], ["Exportar 9:16", false]] },
        ],
      },
      {
        name: "Revisão interna",
        color: "#3BB3C3",
        cards: [{ title: "Stories da promoção de outubro", tags: ["Instagram", "Cliente Vértice"], due: 1, who: [ana.id, carla.id], priority: "MEDIUM", comments: [[admin.id, "Ajustar o CTA do último story para 'Garanta o seu'."]] }],
      },
      {
        name: "Aprovação do cliente",
        color: "#0B9A82",
        cards: [{ title: "Post institucional: nova unidade", tags: ["Instagram", "Cliente Aurora"], due: 4, who: [carla.id] }],
      },
      {
        name: "Publicado",
        isDone: true,
        cards: [
          { title: "Carrossel de dicas de outubro", tags: ["Instagram"], due: -3, who: [bruno.id, ana.id] },
          { title: "Reel do evento de lançamento", tags: ["Vídeo"], due: -5, who: [diego.id] },
        ],
      },
    ],
    0,
  );

  await board(
    "Site Aurora",
    "#3BB3C3",
    "Redesign do site institucional do cliente Aurora.",
    true,
    [
      {
        name: "A fazer",
        cards: [
          { title: "Página de contato com mapa", tags: ["Site", "Cliente Aurora"], due: 9, who: [bruno.id] },
          { title: "Textos da página Sobre", tags: ["Texto", "Cliente Aurora"], due: 6, who: [bruno.id], priority: "MEDIUM" },
        ],
      },
      {
        name: "Fazendo",
        color: "#155E75",
        cards: [
          {
            title: "Layout da home no desktop e no celular",
            tags: ["Site", "Cliente Aurora"],
            priority: "HIGH",
            due: 2,
            start: -2,
            who: [ana.id],
            estimate: 480,
            checklist: [["Wireframe", true], ["Hero", true], ["Seções de serviços", false], ["Rodapé", false], ["Versão celular", false]],
          },
        ],
      },
      { name: "Revisão", color: "#3BB3C3", cards: [{ title: "Mapa do site e menu", tags: ["Site"], due: 0, who: [admin.id, ana.id] }] },
      { name: "Concluído", isDone: true, cards: [{ title: "Reunião de kickoff", tags: ["Cliente Aurora"], due: -7, who: [admin.id] }] },
    ],
    1,
  );

  await board(
    "Semana da equipe",
    "#1E7F4F",
    "O que a equipe interna está tocando nesta semana.",
    false,
    [
      { name: "Backlog", cards: [{ title: "Organizar pasta de modelos no Drive", tags: ["Interno"] }, { title: "Atualizar portfólio no site da agência", tags: ["Interno", "Site"], priority: "LOW" }] },
      { name: "Esta semana", color: "#34C38F", cards: [{ title: "Relatório mensal dos clientes", tags: ["Interno"], due: 5, who: [admin.id], repeat: "MONTHLY", priority: "MEDIUM" }] },
      { name: "Em andamento", color: "#155E75", cards: [{ title: "Proposta para o cliente Vértice", tags: ["Cliente Vértice", "Texto"], due: 1, who: [admin.id, bruno.id], priority: "HIGH" }] },
      { name: "Bloqueado", color: "#0E7C6B", cards: [{ title: "Acesso ao gerenciador de anúncios", tags: ["Cliente Vértice"], who: [carla.id], comments: [[carla.id, "Aguardando o cliente liberar o acesso."]] }] },
      { name: "Feito", isDone: true, cards: [] },
    ],
    2,
  );

  await db.notification.createMany({
    data: [
      { userId: admin.id, actorId: ana.id, type: "MENTION", text: "Ana Souza mencionou você em #9 Mapa do site e menu" },
      { userId: admin.id, actorId: carla.id, type: "ASSIGNED", text: "Carla Mendes colocou você em #19 Proposta para o cliente Vértice" },
    ],
  });

  console.log(`Seed pronto: ${users.length} pessoas, ${number} demandas. Login: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
