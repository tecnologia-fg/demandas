import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { Shell } from "@/components/shell/Shell";
import { initials } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [boards, favorites, unread, folders] = await Promise.all([
    db.board.findMany({ where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, color: true, folderId: true }, take: 200 }),
    db.boardFavorite.findMany({ where: { userId: user.id }, select: { boardId: true } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.boardFolder.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const fav = new Set(favorites.map((f) => f.boardId));
  return (
    <Shell
      user={{ id: user.id, name: user.name, email: user.email, color: user.color, avatarUrl: user.avatarUrl, initials: initials(user.name), isAdmin: user.isAdmin }}
      boards={boards.map((b) => ({ ...b, favorite: fav.has(b.id) }))}
      folders={folders}
      unread={unread}
    >
      {children}
    </Shell>
  );
}
