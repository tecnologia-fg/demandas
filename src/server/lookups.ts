import "server-only";
import { cache } from "react";
import { db } from "./db";
import { toUserLite } from "./serialize";

/** Equipe ativa + etiquetas: usado em quase toda tela para mostrar avatares e etiquetas. */
export const getLookups = cache(async () => {
  const [users, labels, clients] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true, avatarUrl: true }, take: 500 }),
    db.label.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], take: 200 }),
    db.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true, imageUrl: true }, take: 1000 }),
  ]);
  return {
    users: users.map(toUserLite),
    labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    clients,
  };
});
