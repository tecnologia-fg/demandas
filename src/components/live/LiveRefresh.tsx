"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLive } from "./LiveProvider";

/** Telas de resumo (Início, Agenda, Quadros, Clientes): qualquer mudança da equipe recarrega os dados do servidor. */
export function LiveRefresh({ delay = 700 }: { delay?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive((e) => {
    if (e.type !== "board") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), delay);
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return null;
}
