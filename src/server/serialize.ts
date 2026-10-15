import "server-only";
import type { Prisma } from "@prisma/client";
import { initials } from "@/lib/domain";
import { toDayKey } from "@/lib/dates";
import type { ApprovalStatus, CardSummary, UserLite } from "@/lib/types";

export const cardSummaryInclude = {
  assignees: { select: { userId: true } },
  labels: { select: { labelId: true } },
  checklists: { select: { items: { select: { done: true } } } },
  timeEntries: { where: { endedAt: null }, select: { id: true } },
  _count: { select: { comments: true, attachments: true } },
  approvalPost: { select: { status: true } },
} satisfies Prisma.CardInclude;

type CardWithSummary = Prisma.CardGetPayload<{ include: typeof cardSummaryInclude }>;

export function toCardSummary(c: CardWithSummary): CardSummary {
  const items = c.checklists.flatMap((l) => l.items);
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    boardId: c.boardId,
    columnId: c.columnId,
    position: c.position,
    priority: c.priority,
    startDate: toDayKey(c.startDate),
    dueDate: toDayKey(c.dueDate),
    completedAt: c.completedAt?.toISOString() ?? null,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    coverColor: c.coverColor,
    coverImageId: c.coverAttachmentId,
    repeatEvery: c.repeatEvery,
    clientId: c.clientId,
    hasDescription: Boolean(c.description?.trim()),
    assigneeIds: c.assignees.map((a) => a.userId),
    labelIds: c.labels.map((l) => l.labelId),
    checklist: { done: items.filter((i) => i.done).length, total: items.length },
    commentCount: c._count.comments,
    attachmentCount: c._count.attachments,
    timerRunning: c.timeEntries.length > 0,
    approval: c.approvalPost && c.approvalPost.status !== "CANCELED" ? (c.approvalPost.status as ApprovalStatus) : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toUserLite(u: { id: string; name: string; color: string; avatarUrl?: string | null }): UserLite {
  return { id: u.id, name: u.name, color: u.color, initials: initials(u.name), avatarUrl: u.avatarUrl ?? null };
}
