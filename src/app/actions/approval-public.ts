"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { fail, id, run } from "@/server/action";
import { logActivity, notify } from "@/server/events";
import { publishBoard } from "@/server/live";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { approvalColumns, moveCardTo, validToken } from "@/server/approvals";

// Respostas do cliente pelo link (sem login). Vale o link do cliente (todos os posts dele) ou o link
// de um post (só aquele post).

const nameSchema = z.string().trim().min(2, "Escreva o seu nome.").max(60);
const decisionInput = z.object({
  decision: z.enum(["APPROVED", "CHANGES"]),
  name: nameSchema,
  comment: z.string().trim().max(1500).optional().nullable(),
  /** números das artes ("1", "2"...) e/ou "legenda" */
  targets: z.array(z.string().regex(/^(\d{1,2}|legenda)$/)).max(21).optional(),
});

const postAccessSelect = {
  id: true, title: true, status: true, token: true, createdById: true,
  client: { select: { id: true, name: true, active: true, approvalToken: true } },
  card: { select: { id: true, number: true, title: true, boardId: true, columnId: true, column: { select: { name: true } }, assignees: { select: { userId: true } } } },
  rounds: { orderBy: { round: "desc" as const }, take: 1, select: { id: true, round: true, status: true, sentById: true } },
};

async function guard(token: string) {
  if (!validToken(token)) fail("Link inválido.");
  const ip = await clientIp();
  if (!rateLimit(`aprovar:${ip}`, 60, 10 * 60_000).ok) fail("Muitas respostas seguidas. Espere alguns minutos.");
}

/** O post, se este link dá acesso a ele (link do post ou link do cliente dono do post). */
async function postFor(token: string, postId: string) {
  const post = await db.approvalPost.findUnique({ where: { id: id.parse(postId) }, select: postAccessSelect });
  if (!post || !post.client.active || post.status === "CANCELED") fail("Post não encontrado.");
  if (post.token !== token && post.client.approvalToken !== token) fail("Este link não está mais ativo. Peça um novo para a equipe.");
  return post;
}

type Post = Awaited<ReturnType<typeof postFor>>;

async function applyDecision(post: Post, d: { decision: "APPROVED" | "CHANGES"; name: string; comment: string | null; targets: string[] }) {
  const current = post.rounds[0];
  if (!current || current.status !== "PENDING") fail(`"${post.title}" já foi respondido.`);
  const card = post.card;
  await db.$transaction(async (tx) => {
    // troca atômica: duas respostas ao mesmo tempo não valem as duas
    const done = await tx.approval.updateMany({
      where: { id: current.id, status: "PENDING" },
      data: { status: d.decision, decidedAt: new Date(), decidedBy: d.name, clientComment: d.comment, changeTargets: d.targets.length ? JSON.stringify(d.targets) : null },
    });
    if (done.count === 0) fail(`"${post.title}" já foi respondido.`);
    await tx.approvalPost.update({ where: { id: post.id }, data: { status: d.decision } });
    if (card) {
      await logActivity(tx, card.id, null, d.decision === "APPROVED" ? "approval_approved" : "approval_changes", { by: `${d.name} (${post.client.name})`, comment: (d.comment ?? "").slice(0, 300) });
      const cols = await approvalColumns(tx, card.boardId);
      if (cols.approval && card.columnId === cols.approval.id) {
        const to = d.decision === "APPROVED" ? cols.next : cols.back;
        if (to) await moveCardTo(tx, card, card.column, to, null);
      }
    }
    const label = card ? `#${card.number} ${card.title}` : post.title;
    await notify(tx, {
      to: [current.sentById ?? "", post.createdById ?? "", ...(card?.assignees.map((x) => x.userId) ?? [])],
      actorId: null,
      cardId: card?.id ?? null,
      type: d.decision === "APPROVED" ? "APPROVED" : "CHANGES",
      text: d.decision === "APPROVED" ? `${post.client.name} aprovou ${label}` : `${post.client.name} pediu ajustes em ${label}`,
    });
  });
  if (card) publishBoard(card.boardId, null, card.id);
}

function refresh(token: string, post?: Post) {
  revalidatePath(`/aprovar/${token}`);
  if (post) revalidatePath(`/aprovar/p/${post.token}`);
  revalidatePath("/aprovacoes");
}

export async function decideApproval(token: string, postId: string, raw: z.input<typeof decisionInput>) {
  return run(async () => {
    await guard(token);
    const d = decisionInput.parse(raw);
    if (d.decision === "CHANGES" && !d.comment) fail("Conte o que precisa mudar.");
    const post = await postFor(token, postId);
    await applyDecision(post, { decision: d.decision, name: d.name, comment: d.comment || null, targets: d.decision === "CHANGES" ? [...new Set(d.targets ?? [])] : [] });
    refresh(token, post);
  });
}

/** Aprova de uma vez todos os posts que esperam o cliente (só pelo link do cliente). */
export async function approveAll(token: string, rawName: string) {
  return run(async () => {
    await guard(token);
    const name = nameSchema.parse(rawName);
    const client = await db.client.findUnique({ where: { approvalToken: token }, select: { id: true, active: true } });
    if (!client?.active) fail("Este link não está mais ativo. Peça um novo para a equipe.");
    const pending = await db.approvalPost.findMany({ where: { clientId: client.id, status: "PENDING" }, select: postAccessSelect, take: 100 });
    let count = 0;
    for (const post of pending) {
      if (post.rounds[0]?.status !== "PENDING") continue;
      await applyDecision(post, { decision: "APPROVED", name, comment: null, targets: [] }).then(() => count++, () => {});
    }
    refresh(token);
    return { count };
  });
}

/** Mensagem do cliente na conversa do post: avisa a equipe. */
export async function sendClientMessage(token: string, postId: string, raw: { name: string; body: string }) {
  return run(async () => {
    await guard(token);
    const name = nameSchema.parse(raw.name);
    const body = z.string().trim().min(1, "Escreva a mensagem.").max(1500).parse(raw.body);
    const post = await postFor(token, postId);
    await db.$transaction(async (tx) => {
      await tx.approvalMessage.create({ data: { postId: post.id, author: "CLIENT", name, body } });
      await tx.approvalPost.update({ where: { id: post.id }, data: { updatedAt: new Date() } });
      const label = post.card ? `#${post.card.number} ${post.card.title}` : post.title;
      await notify(tx, {
        to: [post.rounds[0]?.sentById ?? "", post.createdById ?? "", ...(post.card?.assignees.map((x) => x.userId) ?? [])],
        actorId: null,
        cardId: post.card?.id ?? null,
        type: "COMMENT",
        text: `${name} (${post.client.name}) escreveu em ${label}: "${body.slice(0, 120)}"`,
      });
    });
    refresh(token, post);
  });
}
