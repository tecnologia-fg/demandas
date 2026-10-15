import "server-only";
import { EventEmitter } from "events";

// Barramento de eventos em memória para a atualização ao vivo (SSE em /api/ao-vivo).
// Um processo só (dev e PM2 com 1 instância): se um dia rodar em várias instâncias, trocar por Redis pub/sub
// mantendo publish/subscribe com a mesma assinatura.

export type LiveEvent = {
  /** board = algo mudou num quadro; notification = notificação nova para `userId` */
  type: "board" | "notification";
  boardId?: string;
  cardId?: string;
  userId?: string;
  actorId?: string | null;
  at: number;
};

const g = globalThis as unknown as { __demandaBus?: EventEmitter };
const bus = g.__demandaBus ?? (g.__demandaBus = new EventEmitter());
bus.setMaxListeners(1000);

export function publish(event: Omit<LiveEvent, "at">) {
  bus.emit("event", { ...event, at: Date.now() } satisfies LiveEvent);
}

export function publishBoard(boardId: string, actorId: string | null, cardId?: string) {
  publish({ type: "board", boardId, cardId, actorId });
}

export function subscribe(fn: (e: LiveEvent) => void) {
  bus.on("event", fn);
  return () => bus.off("event", fn);
}
