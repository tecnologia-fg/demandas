import { getCurrentUser } from "@/server/auth/current";
import { subscribe, type LiveEvent } from "@/server/live";

export const dynamic = "force-dynamic";

/**
 * Atualização ao vivo (Server-Sent Events). Manda para o navegador cada mudança nos quadros e as notificações
 * da própria pessoa; a tela decide o que recarregar. Batimento a cada 25 s para proxies não fecharem a conexão.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sessão expirada.", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribe((e: LiveEvent) => {
        if (e.type === "notification" && e.userId !== user.id) return;
        send(`data: ${JSON.stringify(e)}\n\n`);
      });
      const beat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
