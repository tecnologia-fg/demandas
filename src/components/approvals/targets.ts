/** "arte 1, arte 3 e legenda" a partir do que o cliente marcou para ajustar. */
export function targetsLabel(t: string[]) {
  const arts = t.filter((x) => x !== "legenda").map((x) => `arte ${x}`);
  const all = [...arts, ...(t.includes("legenda") ? ["legenda"] : [])];
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} e ${all[all.length - 1]}` : all[0] ?? "";
}
