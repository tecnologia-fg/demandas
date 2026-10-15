"use client";

import { createContext, useContext, useEffect, useRef } from "react";

export type LiveEvent = { type: "board" | "notification"; boardId?: string; cardId?: string; userId?: string; actorId?: string | null; at: number };
type Listener = (e: LiveEvent) => void;

const Ctx = createContext<{ subscribe: (fn: Listener) => () => void } | null>(null);

/** Uma conexão de atualização ao vivo por aba; as telas assinam e filtram o que interessa. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    // o EventSource reconecta sozinho se a conexão cair
    const source = new EventSource("/api/ao-vivo");
    source.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as LiveEvent;
        listeners.current.forEach((fn) => fn(e));
      } catch {}
    };
    // ao voltar a internet ou a aba, as telas recarregam (podem ter perdido eventos)
    const wake = () => listeners.current.forEach((fn) => fn({ type: "board", at: Date.now() }));
    const onVisible = () => document.visibilityState === "visible" && wake();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source.close();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        subscribe: (fn) => {
          listeners.current.add(fn);
          return () => {
            listeners.current.delete(fn);
          };
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Assina eventos ao vivo. O callback mais recente é sempre o usado (sem reassinar a cada render). */
export function useLive(fn: Listener) {
  const ctx = useContext(Ctx);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((e) => fnRef.current(e));
  }, [ctx]);
}
