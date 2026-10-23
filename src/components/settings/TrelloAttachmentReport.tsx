"use client";

import { useState } from "react";
import { Button } from "@/components/ui/basics";
import { attachmentReportCsv, attachmentStatusLabels, safeSourceUrl, type AttachmentReportRow } from "@/lib/trello/attachments";
import type { PreviewSource } from "@/lib/trello/preview";

export function downloadAttachmentCsv(rows: AttachmentReportRow[], name = "trello-anexos.csv") {
  const url = URL.createObjectURL(new Blob([attachmentReportCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TrelloAttachmentReport({ source }: { source: PreviewSource }) {
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(50);
  const manualReview = source.attachments.filter((row) => ["policy_review", "missing_source"].includes(row.status));
  const visible = showAll ? source.attachments : manualReview;
  return <details className="mt-4 rounded-2xl bg-surface-2 p-4">
    <summary className="cursor-pointer text-sm font-semibold">Relatório por anexo · {source.attachments.length} registros · {manualReview.length} para revisão</summary>
    <p className="my-3 text-xs text-fg-2">Cada registro identifica o card, arquivo, origem e motivo. Ainda não houve tentativa de download: os uploads compatíveis aguardam API ou ZIP. Revisão de tamanho/formato pode exigir conversão ou ajuste de política; reenviar manualmente o mesmo arquivo não contorna esses limites.</p>
    <div className="mb-4 flex flex-wrap gap-2"><Button size="sm" type="button" onClick={() => downloadAttachmentCsv(source.attachments)}>CSV de todos os anexos do quadro</Button><Button size="sm" type="button" disabled={!manualReview.length} onClick={() => downloadAttachmentCsv(manualReview, "trello-anexos-revisar.csv")}>CSV de revisão manual</Button></div>
    {source.attachmentGaps.length ? <div className="mb-4 text-sm"><p className="font-medium">Anexos sem identificação no JSON:</p><ul className="mt-2 grid gap-2">{source.attachmentGaps.map((gap) => <li key={gap.cardId}>{gap.cardTitle} · {gap.missingCount} registros indicados apenas no badge. {safeSourceUrl(gap.cardUrl) ? <a className="underline" href={safeSourceUrl(gap.cardUrl)} target="_blank" rel="noopener noreferrer">Conferir card no Trello</a> : null}</li>)}</ul><p className="mt-2 text-xs text-fg-2">O nome desses arquivos não está disponível. Reconciliar com a API ou com o card antes de fechar a lista manual.</p></div> : null}
    <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={(event) => { setShowAll(event.target.checked); setLimit(50); }} />Mostrar também uploads aguardando recuperação e links externos</label>
    {!visible.length ? <p className="text-sm text-fg-2">Nenhuma exceção de tamanho, formato ou URL identificada neste quadro. Os arquivos ainda precisam ser recuperados.</p> : null}
    <ul className="grid gap-3">{visible.slice(0, limit).map((row) => <li key={`${row.cardId}:${row.attachmentId}`} className="min-w-0 rounded-xl bg-surface p-3 text-sm">
      <p className="break-words font-semibold">{row.name}</p><p className="mt-1 break-words text-fg-2">Card: {row.cardTitle}</p><p className="mt-1 text-xs">{attachmentStatusLabels[row.status]} · {row.bytes === null ? "Tamanho não informado" : `${(row.bytes / 1024 / 1024).toFixed(2)} MiB`}</p>
      <p className="mt-2 text-xs text-fg-2">{row.reasons.join(" ")}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Abrir origem</a> : null}{row.cardUrl ? <a href={row.cardUrl} target="_blank" rel="noopener noreferrer" className="underline">Abrir card</a> : null}</div>
      <p className="mt-2 break-all text-xs text-fg-3">Card {row.cardId} · Anexo {row.attachmentId}</p>
    </li>)}</ul>
    {visible.length > limit ? <Button className="mt-3" size="sm" type="button" onClick={() => setLimit((previous) => previous + 50)}>Mostrar mais 50 registros</Button> : null}
  </details>;
}
