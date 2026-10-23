import { z } from "zod";
import { safeSourceUrl } from "./attachments";

const originSchema = z.object({
  url: z.string().optional(), sourceListName: z.string().optional(),
  externalAssignees: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  resolvedFields: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
});
export function importOrigin(value: unknown) {
  const result = originSchema.safeParse(value);
  if (!result.success) return null;
  return { url: safeSourceUrl(result.data.url), list: result.data.sourceListName ?? "",
    assignees: result.data.externalAssignees ?? [], fields: (result.data.resolvedFields ?? []).map((field) => ({ name: field.name,
      value: typeof field.value === "string" ? field.value : field.value == null ? "" : JSON.stringify(field.value) })) };
}
