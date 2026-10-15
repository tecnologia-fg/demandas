"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { assertAdmin, assertUser } from "@/server/auth/current";
import { audit, logActivity, nextCardNumber } from "@/server/events";
import { fail, id, run } from "@/server/action";
import { publishBoard } from "@/server/live";
import { cardSummaryInclude, toCardSummary } from "@/server/serialize";
import { approvalColumns, copyAttachmentFile, ensureClientToken, isApprovalMedia, loadPostView, moveCardTo, newToken } from "@/server/approvals";

// Aprovação de posts pelo cliente. Um post (ApprovalPost) nasce de uma demanda ou avulso, e cada envio é
// uma versão (Approval) com as próprias artes (ApprovalFile). O cliente responde pelo link dele
// (/aprovar/<token do cliente>, todos os posts) ou pelo link do post (/aprovar/p/<token do post>).

const FORMATS = ["IMAGEM", "CARROSSEL", "REELS", "STORIES", "VIDEO", "TEXTO"] as const;
const item = z.object({ kind: z.enum(["file", "attachment"]), id });
const content = z.object({
  format: z.enum(FORMATS),
  caption: z.string().trim().max(4000).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  publishAt: z.string().datetime({ offset: true }).optional().nullable(),
  items: z.array(item).max(20),
});
const createInput = content.extend({
  title: z.string().trim().min(2, "Dê um título ao post.").max(140),
  clientId: id.optional().nullable(),
  cardId: id.optional().nullable(),
  /** Avulso: cria também uma demanda neste quadro (coluna de aprovação, se houver). */
  boardId: id.optional().nullable(),
});

type Content = z.infer<typeof content>;

/** Monta as artes da versão na ordem escolhida: anexos da demanda são copiados, arquivos já enviados são reaproveitados. */
async function resolveFiles(userId: string, data: Content, ctx: { cardId: string | null; postId: string | null }) {
  const fileIds = data.items.filter((i) => i.kind === "file").map((i) => i.id);
  const attIds = data.items.filter((i) => i.kind === "attachment").map((i) => i.id);
  const [files, atts] = await Promise.all([
    fileIds.length
      ? db.approvalFile.findMany({
          where: { id: { in: fileIds }, OR: [{ approvalId: null, uploadedById: userId }, ...(ctx.postId ? [{ approval: { postId: ctx.postId } }] : [])] },
          select: { id: true, name: true, storedName: true, mime: true, size: true, approvalId: true },
        })
      : [],
    attIds.length && ctx.cardId ? db.attachment.findMany({ where: { id: { in: attIds }, cardId: ctx.cardId }, select: { id: true, name: true, storedName: true, mime: true, size: true } }) : [],
  ]);
  const fileMap = new Map(files.map((f) => [f.id, f]));
  const attMap = new Map(atts.filter((a) => isApprovalMedia(a.mime)).map((a) => [a.id, a]));
  const out: { reuseId?: string; data: { name: string; storedName: string; mime: string; size: number; uploadedById: string | null } }[] = [];
  const seen = new Set<string>();
  for (const it of data.items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    if (it.kind === "file") {
      const f = fileMap.get(it.id);
      if (!f) continue;
      // arquivo recém-enviado (sem versão): passa a ser desta versão; de versão anterior: novo registro, mesmo arquivo
      out.push({ reuseId: f.approvalId ? undefined : f.id, data: { name: f.name, storedName: f.storedName, mime: f.mime, size: f.size, uploadedById: userId } });
    } else {
      const a = attMap.get(it.id);
      if (a) out.push({ data: await copyAttachmentFile(a, userId) });
    }
  }
  if (data.format === "TEXTO" && !data.caption) fail("Escreva o texto que o cliente vai aprovar.");
  if (data.format !== "TEXTO" && out.length === 0) fail("Coloque pelo menos uma arte ou vídeo.");
  if (data.format === "CARROSSEL" && out.length < 2) fail("Carrossel precisa de pelo menos 2 artes.");
  return data.format === "TEXTO" ? [] : out;
}

async function createRound(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], postId: string, round: number, userId: string, data: Content, files: Awaited<ReturnType<typeof resolveFiles>>) {
  const r = await tx.approval.create({ data: { postId, round, format: data.format, caption: data.caption || null, note: data.note || null, sentById: userId } });
  for (const [i, f] of files.entries()) {
    if (f.reuseId) {
      const done = await tx.approvalFile.updateMany({ where: { id: f.reuseId, approvalId: null }, data: { approvalId: r.id, position: i } });
      if (done.count) continue;
    }
    await tx.approvalFile.create({ data: { ...f.data, approvalId: r.id, position: i } });
  }
  return r;
}

/** Leva a demanda para a coluna de aprovação do quadro (se tiver) e registra o envio. */
async function cardOnSend(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], cardId: string, userId: string, round: number) {
  const card = await tx.card.findUnique({ where: { id: cardId }, select: { id: true, boardId: true, columnId: true, completedAt: true, column: { select: { name: true, isDone: true } } } });
  if (!card) return null;
  await logActivity(tx, card.id, userId, "approval_sent", { round: String(round) });
  const cols = await approvalColumns(tx, card.boardId);
  if (cols.approval && !card.column.isDone && !card.completedAt) await moveCardTo(tx, card, card.column, cols.approval, userId);
  return card.boardId;
}

const pubAt = (s: string | null | undefined) => (s ? new Date(s) : null);

/** Cria um post para aprovação: de uma demanda, avulso, ou avulso criando a demanda num quadro. */
export async function createApproval(input: z.input<typeof createInput>) {
  return run(async () => {
    const user = await assertUser();
    const data = createInput.parse(input);
    let cardId = data.cardId ?? null;
    let clientId = data.clientId ?? null;
    let boardId: string | null = null;

    if (cardId) {
      const card = await db.card.findUnique({ where: { id: cardId }, select: { id: true, clientId: true, boardId: true, board: { select: { archivedAt: true } }, approvalPost: { select: { id: true } } } });
      if (!card || card.board.archivedAt) fail("Demanda não encontrada.");
      if (card.approvalPost) fail("Esta demanda já tem uma aprovação. Envie uma nova versão.");
      clientId = card.clientId ?? clientId;
      boardId = card.boardId;
    }
    if (!clientId) fail("Escolha o cliente que vai aprovar.");
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, active: true } });
    if (!client?.active) fail("Cliente não encontrado.");
    const files = await resolveFiles(user.id, data, { cardId, postId: null });

    const post = await db.$transaction(async (tx) => {
      if (!cardId && data.boardId) {
        const board = await tx.board.findUnique({ where: { id: data.boardId }, select: { id: true, archivedAt: true } });
        if (!board || board.archivedAt) fail("Quadro não encontrado.");
        const cols = await approvalColumns(tx, board.id);
        const col = cols.approval ?? (await tx.column.findFirst({ where: { boardId: board.id, isDone: false }, orderBy: { position: "asc" }, select: { id: true, name: true } }));
        if (!col) fail("O quadro não tem colunas.");
        const last = await tx.card.findFirst({ where: { columnId: col.id }, orderBy: { position: "desc" }, select: { position: true } });
        const created = await tx.card.create({ data: { title: data.title, boardId: board.id, columnId: col.id, position: (last?.position ?? -1) + 1, number: await nextCardNumber(tx), clientId: client.id, createdById: user.id } });
        await logActivity(tx, created.id, user.id, "created", { column: col.name });
        cardId = created.id;
        boardId = board.id;
      } else if (cardId) {
        await tx.card.update({ where: { id: cardId }, data: { clientId: client.id } });
      }
      const p = await tx.approvalPost.create({
        data: { token: newToken(), title: data.title, format: data.format, status: "PENDING", publishAt: pubAt(data.publishAt), clientId: client.id, cardId, createdById: user.id },
      });
      await createRound(tx, p.id, 1, user.id, data, files);
      await ensureClientToken(tx, client.id);
      if (cardId) await cardOnSend(tx, cardId, user.id, 1);
      return p;
    });
    if (boardId) publishBoard(boardId, user.id, cardId ?? undefined);
    revalidatePath("/aprovacoes");
    return { postId: post.id, token: post.token, card: cardId ? toCardSummary(await db.card.findUniqueOrThrow({ where: { id: cardId }, include: cardSummaryInclude })) : null };
  });
}

/** Nova versão do post: a versão pendente é substituída e o cliente volta a ver o post para aprovar. */
export async function sendNewVersion(postId: string, input: z.input<typeof content> & { title?: string }) {
  return run(async () => {
    const user = await assertUser();
    const data = content.parse(input);
    const title = input.title ? z.string().trim().min(2).max(140).parse(input.title) : null;
    const post = await db.approvalPost.findUnique({ where: { id: id.parse(postId) }, select: { id: true, cardId: true, card: { select: { boardId: true } } } });
    if (!post) fail("Post não encontrado.");
    const files = await resolveFiles(user.id, data, { cardId: post.cardId, postId: post.id });
    let round = 0;
    await db.$transaction(async (tx) => {
      await tx.approval.updateMany({ where: { postId: post.id, status: "PENDING" }, data: { status: "CANCELED" } });
      const last = await tx.approval.findFirst({ where: { postId: post.id }, orderBy: { round: "desc" }, select: { round: true } });
      round = (last?.round ?? 0) + 1;
      await createRound(tx, post.id, round, user.id, data, files);
      await tx.approvalPost.update({ where: { id: post.id }, data: { status: "PENDING", format: data.format, publishAt: pubAt(data.publishAt), ...(title ? { title } : {}) } });
      if (post.cardId) await cardOnSend(tx, post.cardId, user.id, round);
    });
    if (post.card) publishBoard(post.card.boardId, user.id, post.cardId ?? undefined);
    revalidatePath("/aprovacoes");
    return { round, card: post.cardId ? toCardSummary(await db.card.findUniqueOrThrow({ where: { id: post.cardId }, include: cardSummaryInclude })) : null };
  });
}

/** Arquiva o post: sai do link do cliente (a versão pendente é cancelada). */
export async function archiveApproval(postId: string) {
  return run(async () => {
    const user = await assertUser();
    const post = await db.approvalPost.findUnique({ where: { id: id.parse(postId) }, select: { id: true, cardId: true, card: { select: { boardId: true } } } });
    if (!post) fail("Post não encontrado.");
    await db.$transaction(async (tx) => {
      await tx.approval.updateMany({ where: { postId: post.id, status: "PENDING" }, data: { status: "CANCELED" } });
      await tx.approvalPost.update({ where: { id: post.id }, data: { status: "CANCELED" } });
      if (post.cardId) await logActivity(tx, post.cardId, user.id, "approval_canceled");
    });
    if (post.card) publishBoard(post.card.boardId, user.id, post.cardId ?? undefined);
    revalidatePath("/aprovacoes");
  });
}

/** Publicado (ou volta para aprovado). Publicar leva a demanda para a coluna de concluídas do quadro. */
export async function setApprovalPublished(postId: string, published: boolean) {
  return run(async () => {
    const user = await assertUser();
    const post = await db.approvalPost.findUnique({
      where: { id: id.parse(postId) },
      select: { id: true, status: true, cardId: true, card: { select: { id: true, boardId: true, columnId: true, column: { select: { name: true, isDone: true } } } } },
    });
    if (!post) fail("Post não encontrado.");
    if (published && post.status !== "APPROVED") fail("Só dá para marcar como publicado um post aprovado.");
    if (!published && post.status !== "PUBLISHED") fail("Este post não está marcado como publicado.");
    await db.$transaction(async (tx) => {
      await tx.approvalPost.update({ where: { id: post.id }, data: { status: published ? "PUBLISHED" : "APPROVED" } });
      if (post.card && published) {
        await logActivity(tx, post.card.id, user.id, "approval_published");
        const cols = await approvalColumns(tx, post.card.boardId);
        if (cols.done && !post.card.column.isDone) await moveCardTo(tx, post.card, post.card.column, cols.done, user.id);
      }
    });
    if (post.card) publishBoard(post.card.boardId, user.id, post.card.id);
    revalidatePath("/aprovacoes");
  });
}

export async function updateApprovalDetails(postId: string, input: { title: string; publishAt: string | null }) {
  return run(async () => {
    await assertUser();
    const data = z.object({ title: z.string().trim().min(2, "Dê um título ao post.").max(140), publishAt: z.string().datetime({ offset: true }).nullable() }).parse(input);
    await db.approvalPost.update({ where: { id: id.parse(postId) }, data: { title: data.title, publishAt: pubAt(data.publishAt) } });
    revalidatePath("/aprovacoes");
  });
}

/** Resposta da equipe na conversa do post (o cliente vê no link). */
export async function sendTeamMessage(postId: string, body: string) {
  return run(async () => {
    const user = await assertUser();
    const text = z.string().trim().min(1, "Escreva a mensagem.").max(1500).parse(body);
    const post = await db.approvalPost.findUnique({ where: { id: id.parse(postId) }, select: { id: true } });
    if (!post) fail("Post não encontrado.");
    await db.approvalMessage.create({ data: { postId: post.id, author: "TEAM", name: user.name, userId: user.id, body: text } });
    await db.approvalPost.update({ where: { id: post.id }, data: { updatedAt: new Date() } });
    revalidatePath("/aprovacoes");
    return loadPostView(post.id);
  });
}

/** Post completo para a janela de detalhe. */
export async function getApprovalPost(postId: string) {
  return run(async () => {
    await assertUser();
    const view = await loadPostView(id.parse(postId));
    if (!view) fail("Post não encontrado.");
    return view;
  });
}

/** Link de aprovação do cliente (cria na primeira vez). */
export async function getClientApprovalLink(clientId: string) {
  return run(async () => {
    await assertUser();
    const cid = id.parse(clientId);
    const token = await db.$transaction((tx) => ensureClientToken(tx, cid));
    return { token };
  });
}

/** Troca o link do cliente: o antigo para de funcionar na hora. */
export async function regenerateClientApprovalLink(clientId: string) {
  return run(async () => {
    const user = await assertAdmin();
    const c = await db.client.update({ where: { id: id.parse(clientId) }, data: { approvalToken: newToken() }, select: { name: true, approvalToken: true } });
    await audit(user.id, "client.approval-link", c.name);
    revalidatePath("/aprovacoes");
    return { token: c.approvalToken! };
  });
}

/** Troca o link de um post: o antigo para de funcionar na hora. */
export async function regeneratePostLink(postId: string) {
  return run(async () => {
    await assertUser();
    const p = await db.approvalPost.update({ where: { id: id.parse(postId) }, data: { token: newToken() }, select: { token: true } });
    revalidatePath("/aprovacoes");
    return { token: p.token };
  });
}
