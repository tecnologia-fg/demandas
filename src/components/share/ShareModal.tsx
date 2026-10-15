"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/basics";
import { Modal, useFeedback } from "@/components/ui/overlay";
import { createShareLink, getShareLink, revokeShareLink } from "@/app/actions/share";

export function ShareModal({ open, boardId, boardName, onClose }: { open: boolean; boardId: string; boardName: string; onClose: () => void }) {
  return open ? <ShareInner boardId={boardId} boardName={boardName} onClose={onClose} /> : null;
}

function ShareInner({ boardId, boardName, onClose }: { boardId: string; boardName: string; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getShareLink(boardId).then((res) => (res.ok ? setToken(res.data.token) : (toast(res.error, "error"), setToken(null))));
  }, [boardId, toast]);
  const url = token ? `${window.location.origin}/compartilhado/${token}` : "";

  const create = async (trocar: boolean) => {
    if (trocar && !(await confirm({ title: "Gerar um link novo?", text: "O link antigo para de funcionar na hora. Quem tinha ele perde o acesso.", confirm: "Gerar link novo" }))) return;
    setBusy(true);
    const res = await createShareLink(boardId);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setToken(res.data.token);
    toast(trocar ? "Link novo criado" : "Link criado");
  };
  const revoke = async () => {
    if (!(await confirm({ title: "Desligar o link?", text: "Quem tiver o link deixa de ver o quadro.", confirm: "Desligar link", danger: true }))) return;
    setBusy(true);
    const res = await revokeShareLink(boardId);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setToken(null);
    toast("Link desligado");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copiado");
    } catch {
      toast("Não deu para copiar. Selecione o link e copie.", "error");
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title="Compartilhar com cliente">
      <div className="grid gap-4">
        <p className="text-sm text-fg-2">
          Quem tiver o link vê o quadro <b className="text-fg">{boardName}</b> sem login e sem poder mudar nada. Comentários, anexos e histórico não aparecem.
        </p>
        {token === undefined ? (
          <p className="text-sm text-fg-3">Carregando...</p>
        ) : token ? (
          <>
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-3">
              <Link2 className="size-4 shrink-0 text-fg-3" />
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link do quadro" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <Button size="sm" variant="primary" onClick={copy}><Copy className="size-3.5" /> Copiar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-medium hover:bg-surface-3"><ExternalLink className="size-3.5" /> Abrir como o cliente</a>
              <Button size="sm" loading={busy} onClick={() => create(true)}><RefreshCw className="size-3.5" /> Gerar link novo</Button>
              <Button size="sm" variant="ghost" onClick={revoke} disabled={busy}><Unlink className="size-3.5" /> Desligar link</Button>
            </div>
          </>
        ) : (
          <Button variant="primary" loading={busy} onClick={() => create(false)} className="justify-self-start"><Link2 className="size-4" /> Criar link do quadro</Button>
        )}
      </div>
    </Modal>
  );
}
