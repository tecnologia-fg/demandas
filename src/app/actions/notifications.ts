"use server";

import { db } from "@/server/db";
import { assertUser } from "@/server/auth/current";
import { id, run } from "@/server/action";

export async function listNotifications() {
  return run(async () => {
    const user = await assertUser();
    const [items, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { actor: { select: { name: true, color: true } }, card: { select: { id: true, boardId: true } } },
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        text: n.text,
        read: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
        actor: n.actor ? { name: n.actor.name, color: n.actor.color } : null,
        href: n.card ? `/quadros/${n.card.boardId}?demanda=${n.card.id}` : null,
      })),
    };
  });
}

export async function unreadCount() {
  return run(async () => {
    const user = await assertUser();
    return db.notification.count({ where: { userId: user.id, readAt: null } });
  });
}

export async function markRead(notificationId: string | "all") {
  return run(async () => {
    const user = await assertUser();
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(notificationId === "all" ? {} : { id: id.parse(notificationId) }) },
      data: { readAt: new Date() },
    });
  });
}
