export type AttachmentReportRow = {
  boardId: string; boardName: string; cardId: string; cardTitle: string; cardUrl: string;
  attachmentId: string; name: string; bytes: number | null; sourceUrl: string;
  status: "pending_recovery" | "policy_review" | "external_link" | "missing_source";
  reasons: string[];
};
export type AttachmentGap = { cardId: string; cardTitle: string; cardUrl: string; missingCount: number };
export const attachmentStatusLabels: Record<AttachmentReportRow["status"], string> = {
  pending_recovery: "Aguardando recuperação (API ou ZIP)",
  policy_review: "Revisar tamanho/formato para envio ao Dmanda",
  external_link: "Link externo: preservar referência",
  missing_source: "Origem indisponível: localizar manualmente",
};
export const supportedAttachmentExtensions = new Set("jpg jpeg png webp gif heic pdf doc docx xls xlsx ppt pptx txt csv zip mp4 mov mp3 wav psd ai fig".split(" "));
export function safeSourceUrl(value: string | undefined): string {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
export function attachmentReportRow(context: Pick<AttachmentReportRow, "boardId" | "boardName" | "cardId" | "cardTitle"> & { cardUrl?: string }, attachment: { id: string; name: string; fileName?: string; bytes?: number | null; isUpload: boolean; url?: string }): AttachmentReportRow {
  const name = attachment.fileName || attachment.name;
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
  const reasons: string[] = [];
  const sourceUrl = safeSourceUrl(attachment.url);
  const tooLarge = attachment.isUpload && (attachment.bytes ?? 0) > 25 * 1024 * 1024;
  const unsupported = attachment.isUpload && (!ext || !supportedAttachmentExtensions.has(ext));
  if (!sourceUrl) reasons.push("URL de origem ausente ou inválida; localizar o arquivo no card ou com a equipe.");
  if (!attachment.isUpload) reasons.push("Referência externa; não há binário Trello a importar neste registro.");
  if (tooLarge) reasons.push("Arquivo maior que o limite atual de 25 MiB do Dmanda.");
  if (unsupported) reasons.push(`Formato ${ext ? `.${ext}` : "sem extensão identificada"} fora da política atual do Dmanda.`);
  const policyReview = tooLarge || unsupported;
  return { ...context, cardUrl: safeSourceUrl(context.cardUrl), attachmentId: attachment.id, name,
    bytes: attachment.bytes ?? null, sourceUrl,
    status: !sourceUrl ? "missing_source" : !attachment.isUpload ? "external_link" : policyReview ? "policy_review" : "pending_recovery",
    reasons: reasons.length ? reasons : ["Binário ainda não foi recuperado ou enviado ao Dmanda; tentar API ou exportação com anexos."] };
}
export function attachmentReportCsv(rows: AttachmentReportRow[]): string {
  // Campos são dados externos: proteger leitores que executam fórmulas de CSV.
  const cell = (value: string | number | null) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const header = ["Quadro", "ID quadro", "Card", "ID card", "Link card", "Anexo", "ID anexo", "Bytes", "Link origem", "Situação", "Motivo"];
  return "\uFEFF" + [header, ...rows.map((row) => [row.boardName, row.boardId, row.cardTitle, row.cardId, row.cardUrl, row.name, row.attachmentId, row.bytes, row.sourceUrl, attachmentStatusLabels[row.status], row.reasons.join(" | ")])].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
