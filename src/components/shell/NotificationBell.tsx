"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, BadgeCheck, Bell, CheckCheck, MessageCircle, MessageSquareWarning, MoveRight, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/dates";
import { Popover } from "@/components/ui/overlay";
import { listNotifications, markRead, unreadCount } from "@/app/actions/notifications";
import { useLive } from "@/components/live/LiveProvider";

type Item = { id: string; type: string; text: string; read: boolean; createdAt: string; href: string | null };

const ICON: Record<string, typeof Bell> = { ASSIGNED: UserPlus, MENTION: AtSign, COMMENT: MessageCircle, MOVED: MoveRight, APPROVED: BadgeCheck, CHANGES: MessageSquareWarning };

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    const res = await listNotifications();
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  }, []);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      const res = await unreadCount();
      if (res.ok) setUnread(res.data);
    };
    const t = setInterval(tick, 45_000);
    return () => clearInterval(t);
  }, []);

  // notificação nova chega ao vivo: atualiza o número (e a lista, se estiver aberta)
  useLive((e) => {
    if (e.type !== "notification") return;
    if (open) void load();
    else unreadCount().then((res) => res.ok && setUnread(res.data));
  });

  const go = async (n: Item) => {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      void markRead(n.id);
    }
    if (n.href) router.push(n.href);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={unread ? `Notificações, ${unread} novas` : "Notificações"}
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
        className={cn("relative inline-flex size-9 items-center justify-center rounded-full transition-colors", open ? "bg-panel text-panel-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={360} className="p-0">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="font-semibold">Notificações</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={async () => {
                await markRead("all");
                setUnread(0);
                setItems((all) => all?.map((i) => ({ ...i, read: true })) ?? null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="grid gap-0.5 px-1.5 pb-1.5">
          {items === null && <p className="px-3 py-6 text-center text-sm text-fg-3">Carregando...</p>}
          {items?.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-3">Nada por aqui. Quando alguém te colocar numa demanda ou te mencionar, aparece aqui.</p>}
          {items?.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <button key={n.id} type="button" onClick={() => go(n)} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-surface-2">
                <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full", n.read ? "bg-surface-3 text-fg-2" : "bg-accent text-accent-ink")}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13.5px] leading-snug", n.read ? "text-fg-2" : "text-fg font-medium")}>{n.text}</span>
                  <span className="text-xs text-fg-3">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
