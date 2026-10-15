"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ClientLite, LabelLite, UserLite } from "@/lib/types";

type Lookups = {
  me: UserLite & { isAdmin: boolean };
  users: UserLite[];
  labels: LabelLite[];
  userById: Map<string, UserLite>;
  labelById: Map<string, LabelLite>;
  addLabel: (l: LabelLite) => void;
  clients: ClientLite[];
  clientById: Map<string, ClientLite>;
  addClient: (c: ClientLite) => void;
};

const Ctx = createContext<Lookups | null>(null);

export function LookupsProvider({
  me,
  users,
  labels: initialLabels,
  clients: initialClients = [],
  children,
}: {
  me: UserLite & { isAdmin: boolean };
  users: UserLite[];
  labels: LabelLite[];
  clients?: ClientLite[];
  children: React.ReactNode;
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [clients, setClients] = useState(initialClients);
  const value = useMemo<Lookups>(
    () => ({
      me,
      users,
      labels,
      userById: new Map(users.map((u) => [u.id, u])),
      labelById: new Map(labels.map((l) => [l.id, l])),
      addLabel: (l) => setLabels((all) => [...all, l]),
      clients,
      clientById: new Map(clients.map((c) => [c.id, c])),
      addClient: (c) => setClients((all) => [...all, c].sort((a, b) => a.name.localeCompare(b.name))),
    }),
    [me, users, labels, clients],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLookups() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("LookupsProvider ausente");
  return ctx;
}

/** Igual a useLookups, mas devolve vazio fora do provider (ex.: modal de quadro na página de Quadros). */
export function useLookupsSafe(): Partial<Lookups> {
  return useContext(Ctx) ?? {};
}
