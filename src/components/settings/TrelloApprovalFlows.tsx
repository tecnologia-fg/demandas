"use client";
import { useState } from "react";
import { exportTrelloApprovalFlows, saveTrelloApprovalFlow } from "@/app/actions/trello-approval-flow";
import type { ApprovalFlow } from "@/lib/trello/approval-flow";

type Board = { id: string; name: string; columns: { id: string; name: string; isDone: boolean }[]; flow: ApprovalFlow | null };
export function TrelloApprovalFlows({ boards }: { boards: Board[] }) {
  const [message, setMessage] = useState("");
  return <div className="grid gap-4"><button className="justify-self-start rounded-full bg-panel px-4 py-2 text-sm text-panel-fg" onClick={async () => {
    try {
      const result = await exportTrelloApprovalFlows(); if (!result.ok) { setMessage(result.error); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "trello-approval-flows.json"; link.click(); URL.revokeObjectURL(url); setMessage("Fluxos salvos exportados.");
    } catch { setMessage("Não foi possível exportar os fluxos."); }
  }}>Exportar fluxos salvos</button><p role="status">{message}</p>{boards.map((board) => <FlowForm key={board.id} board={board} />)}</div>;
}
function FlowForm({ board }: { board: Board }) {
  const [flow, setFlow] = useState<ApprovalFlow>(board.flow ?? { approval: "", next: "", back: "", done: "" });
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const labels = { approval: "Enviado ao cliente", next: "Cliente aprovou", back: "Cliente pediu ajustes", done: "Publicado" };
  return <form className="grid gap-3 rounded-2xl border border-border p-4" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await saveTrelloApprovalFlow(board.id, flow); setMessage(result.ok ? "Fluxo salvo por ID de coluna." : result.error); }
    catch { setMessage("Não foi possível salvar. Tente novamente."); } finally { setBusy(false); }
  }}>
    <h2 className="font-semibold">{board.name}</h2>
    {!board.flow && <p className="text-sm">Revise os quatro destinos antes de enviar demandas deste quadro ao portal.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as (keyof ApprovalFlow)[]).map((key) => <label className="grid gap-1 text-sm" key={key}>
      {labels[key]}<select required aria-label={`${board.name}: ${labels[key]}`} className="rounded-lg border border-border bg-surface p-2" value={flow[key]} onChange={(e) => setFlow({ ...flow, [key]: e.target.value })}>
        <option value="">Escolha a coluna</option>{board.columns.filter((c) => c.isDone === (key === "done")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>)}</div>
    <button disabled={busy} className="justify-self-start rounded-full bg-panel px-4 py-2 text-sm text-panel-fg">{busy ? "Salvando…" : "Salvar fluxo"}</button>
    <p role="status" className="text-sm">{message}</p>
  </form>;
}
