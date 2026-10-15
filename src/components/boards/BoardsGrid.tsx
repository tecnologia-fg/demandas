"use client";

import Link from "next/link";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArchiveRestore, ChevronDown, Folder, FolderPlus, LayoutGrid, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserLite } from "@/lib/types";
import { shapeColors } from "@/lib/color";
import { PALETTE } from "@/lib/domain";
import { AvatarStack, Button, EmptyState, Field, Input } from "@/components/ui/basics";
import { MenuItem, MenuLabel, Modal, Popover, useFeedback } from "@/components/ui/overlay";
import { PageHeader } from "@/components/PageHeader";
import { BoardFormModal } from "@/components/board/BoardModals";
import { ColorGrid } from "@/components/board/pickers";
import { archiveBoard, toggleFavorite } from "@/app/actions/boards";
import { createFolder, deleteFolder, moveBoardToFolder, setBoardColor, updateFolder } from "@/app/actions/folders";

export type BoardTile = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  folderId: string | null;
  clientId: string | null;
  archived: boolean;
  favorite: boolean;
  columns: { id: string; name: string; color: string | null; isDone: boolean; count: number }[];
  total: number;
  done: number;
  late: number;
  members: UserLite[];
};

export type FolderLite = { id: string; name: string; color: string };

// pastas fechadas ficam lembradas neste navegador
const CLOSED_KEY = "dmanda:pastas-fechadas";
const closedListeners = new Set<() => void>();
const readClosed = () => {
  try {
    return localStorage.getItem(CLOSED_KEY) || "[]";
  } catch {
    return "[]";
  }
};
function useClosedFolders() {
  const raw = useSyncExternalStore(
    (cb) => {
      closedListeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        closedListeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readClosed,
    () => "[]",
  );
  const closed = useMemo<string[]>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);
  const toggle = (fid: string) => {
    const next = closed.includes(fid) ? closed.filter((x) => x !== fid) : [...closed, fid];
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
    } catch {}
    closedListeners.forEach((l) => l());
  };
  return [closed, toggle] as const;
}

export function BoardsGrid({ boards, folders, isAdmin, openNew }: { boards: BoardTile[]; folders: FolderLite[]; isAdmin: boolean; openNew: boolean }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [creatingLocal, setCreating] = useState(false);
  const [newIn, setNewIn] = useState<string | null>(null);
  const creating = creatingLocal || openNew;
  const [editing, setEditing] = useState<BoardTile | null>(null);
  const [folderForm, setFolderForm] = useState<{ folder?: FolderLite } | null>(null);
  const [closed, toggleClosed] = useClosedFolders();

  const active = boards.filter((b) => !b.archived);
  const archived = boards.filter((b) => b.archived);
  const sorted = [...active.filter((b) => b.favorite), ...active.filter((b) => !b.favorite)];
  const folderIds = new Set(folders.map((f) => f.id));
  const loose = sorted.filter((b) => !b.folderId || !folderIds.has(b.folderId));
  const refresh = () => router.refresh();
  const newBoard = (fid: string | null) => {
    setNewIn(fid);
    setCreating(true);
  };

  const removeFolder = async (f: FolderLite) => {
    const ok = await confirm({ title: `Excluir a pasta ${f.name}?`, text: "Os quadros dela continuam, só ficam sem pasta.", confirm: "Excluir pasta", danger: true });
    if (!ok) return;
    const res = await deleteFolder(f.id);
    if (!res.ok) return toast(res.error, "error");
    toast("Pasta excluída");
    refresh();
  };

  const grid = (list: BoardTile[], fid: string | null, withNew: boolean) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((b) => (
        <BoardCard key={b.id} b={b} folders={folders} onEdit={() => setEditing(b)} onChanged={refresh} />
      ))}
      {withNew && (
        <button type="button" onClick={() => newBoard(fid)} className="glass flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[26px] text-sm font-medium text-fg-2 transition-colors hover:text-fg">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-panel text-panel-fg"><Plus className="size-5" /></span>
          Novo quadro
        </button>
      )}
    </div>
  );

  return (
    <div className="pb-10">
      <LiveRefresh />
      <PageHeader
        title="Quadros"
        subtitle={`${active.length} ${active.length === 1 ? "quadro" : "quadros"} da equipe`}
        actions={
          <div className="flex items-center gap-2">
            <Button className="h-11" onClick={() => setFolderForm({})}>
              <FolderPlus className="size-4" /> Nova pasta
            </Button>
            <Button variant="dark" className="h-11" onClick={() => newBoard(null)}>
              <Plus className="size-4" /> Novo quadro
            </Button>
          </div>
        }
      />
      <div className="px-4 lg:px-6">
        {active.length === 0 && folders.length === 0 ? (
          <EmptyState icon={<LayoutGrid className="size-5" />} title="Nenhum quadro ainda" text="Crie um quadro por cliente, projeto ou área da equipe." action={<Button variant="primary" onClick={() => newBoard(null)}>Criar o primeiro quadro</Button>} />
        ) : folders.length === 0 ? (
          grid(sorted, null, true)
        ) : (
          <div className="grid gap-8">
            {folders.map((f) => {
              const list = sorted.filter((b) => b.folderId === f.id);
              const isClosed = closed.includes(f.id);
              return (
                <section key={f.id} className="grid gap-3" aria-label={`Pasta ${f.name}`}>
                  <FolderHeader folder={f} count={list.length} closed={isClosed} onToggle={() => toggleClosed(f.id)} onNew={() => newBoard(f.id)} onEdit={() => setFolderForm({ folder: f })} onDelete={() => removeFolder(f)} />
                  {!isClosed &&
                    (list.length > 0 ? (
                      grid(list, f.id, false)
                    ) : (
                      <p className="glass rounded-2xl px-5 py-4 text-sm text-fg-2">Pasta vazia. Crie um quadro aqui ou use o menu de um quadro para trazer para cá.</p>
                    ))}
                </section>
              );
            })}
            <section className="grid gap-3" aria-label="Quadros sem pasta">
              <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-fg-3">Sem pasta</h2>
              {grid(loose, null, true)}
            </section>
          </div>
        )}

        {isAdmin && archived.length > 0 && (
          <section className="mt-10 grid gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-3">Arquivados</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((b) => (
                <div key={b.id} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
                  <span className="size-3 rounded-full" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const res = await archiveBoard(b.id, false);
                      if (!res.ok) return toast(res.error, "error");
                      toast("Quadro restaurado");
                      router.refresh();
                    }}
                  >
                    <ArchiveRestore className="size-3.5" /> Restaurar
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <BoardFormModal
        open={creating}
        folderId={newIn}
        onClose={() => {
          setCreating(false);
          if (openNew) router.replace("/quadros");
        }}
        onSaved={(b) => {
          setCreating(false);
          router.push(`/quadros/${b.id}`);
        }}
      />
      <BoardFormModal
        open={editing !== null}
        board={editing ? { id: editing.id, name: editing.name, description: editing.description, color: editing.color, clientId: editing.clientId } : undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast("Quadro atualizado");
          refresh();
        }}
      />
      <FolderFormModal open={folderForm !== null} folder={folderForm?.folder} onClose={() => setFolderForm(null)} onSaved={() => { setFolderForm(null); refresh(); }} />
    </div>
  );
}

function BoardCard({ b, folders, onEdit, onChanged }: { b: BoardTile; folders: FolderLite[]; onEdit: () => void; onChanged: () => void }) {
  const { toast } = useFeedback();
  const tone = shapeColors(b.color);
  return (
    <div className="glass group relative rounded-[26px] shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/quadros/${b.id}`} className="grid gap-4 rounded-[26px] p-5">
        <div className="flex items-center gap-3 pr-[76px]">
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
            {b.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold">{b.name}</h2>
            <p className="line-clamp-1 text-sm text-fg-2">{b.description || `${b.columns.length} colunas`}</p>
          </div>
        </div>

        {/* distribuição das demandas pelas colunas */}
        <div className="grid gap-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface/70">
            {b.total > 0 &&
              b.columns.filter((c) => c.count > 0).map((c) => (
                <span key={c.id} title={`${c.name}: ${c.count}`} style={{ width: `${(c.count / b.total) * 100}%`, background: c.isDone ? "var(--success)" : c.color ?? "var(--fg-3)" }} />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2">
            {b.columns.slice(0, 5).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: c.isDone ? "var(--success)" : c.color ?? "var(--fg-3)" }} />
                {c.name} <span className="font-semibold text-fg">{c.count}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <AvatarStack users={b.members} max={4} size={26} />
          <div className="ml-auto flex items-center gap-2">
            {b.late > 0 && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-danger px-2.5 text-xs font-semibold text-white">
                <AlertCircle className="size-3.5" /> {b.late} {b.late === 1 ? "atrasada" : "atrasadas"}
              </span>
            )}
            <span className="inline-flex h-7 items-center rounded-full bg-surface/80 px-2.5 text-xs font-medium text-fg-2">
              {b.total - b.done} em aberto
            </span>
          </div>
        </div>
      </Link>
      {/* ações fora do link: o menu abre sem navegar para o quadro */}
      <div className="absolute right-4 top-[22px] flex items-center gap-1">
        <button
          type="button"
          aria-label={b.favorite ? "Tirar dos favoritos" : "Favoritar"}
          onClick={async () => {
            const res = await toggleFavorite(b.id);
            if (!res.ok) toast(res.error, "error");
            onChanged();
          }}
          className={cn("inline-flex size-8 items-center justify-center rounded-full hover:bg-surface", b.favorite ? "text-accent-strong" : "text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100")}
        >
          <Star className="size-4" fill={b.favorite ? "currentColor" : "none"} />
        </button>
        <BoardMenu b={b} folders={folders} onEdit={onEdit} onChanged={onChanged} />
      </div>
    </div>
  );
}

function BoardMenu({ b, folders, onEdit, onChanged }: { b: BoardTile; folders: FolderLite[]; onEdit: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useFeedback();
  const act = async (p: Promise<{ ok: true } | { ok: false; error: string }>, msg?: string) => {
    const res = await p;
    if (!res.ok) return toast(res.error, "error");
    if (msg) toast(msg);
    onChanged();
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`Opções do quadro ${b.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-8 items-center justify-center rounded-full text-fg-3 hover:bg-surface hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={296} align="end" className="p-2">
        <MenuLabel>Cor do quadro</MenuLabel>
        <div className="px-2.5 pb-2 pt-1">
          <ColorGrid value={b.color} onChange={(c) => c && c !== b.color && act(setBoardColor(b.id, c))} size={24} />
        </div>
        <MenuLabel>Pasta</MenuLabel>
        <MenuItem icon={<LayoutGrid />} active={!b.folderId} onClick={() => { setOpen(false); if (b.folderId) act(moveBoardToFolder(b.id, null), "Quadro sem pasta"); }}>
          Sem pasta
        </MenuItem>
        {folders.map((f) => (
          <MenuItem key={f.id} icon={<Folder style={{ color: f.color }} />} active={b.folderId === f.id} onClick={() => { setOpen(false); if (b.folderId !== f.id) act(moveBoardToFolder(b.id, f.id), `Quadro movido para ${f.name}`); }}>
            {f.name}
          </MenuItem>
        ))}
        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<Pencil />} onClick={() => { setOpen(false); onEdit(); }}>
          Editar quadro
        </MenuItem>
      </Popover>
    </>
  );
}

function FolderHeader({ folder, count, closed, onToggle, onNew, onEdit, onDelete }: { folder: FolderLite; count: number; closed: boolean; onToggle: () => void; onNew: () => void; onEdit: () => void; onDelete: () => void }) {
  const tone = shapeColors(folder.color);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onToggle} aria-expanded={!closed} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pr-2 text-left">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: tone.bg, color: tone.fg }}>
          <Folder className="size-[18px]" />
        </span>
        <span className="min-w-0 truncate text-[17px] font-semibold">{folder.name}</span>
        <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-surface/80 px-2.5 text-xs font-medium text-fg-2">
          {count} {count === 1 ? "quadro" : "quadros"}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", closed && "-rotate-90")} />
      </button>
      <Button size="sm" onClick={onNew}>
        <Plus className="size-3.5" /> Novo quadro
      </Button>
      <button ref={ref} type="button" aria-label={`Opções da pasta ${folder.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex size-8 items-center justify-center rounded-full text-fg-3 hover:bg-surface hover:text-fg">
        <MoreHorizontal className="size-4" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240} align="end" className="p-2">
        <MenuItem icon={<Pencil />} onClick={() => { setOpen(false); onEdit(); }}>
          Renomear e mudar a cor
        </MenuItem>
        <MenuItem icon={<Trash2 />} danger onClick={() => { setOpen(false); onDelete(); }}>
          Excluir pasta
        </MenuItem>
      </Popover>
    </div>
  );
}

function FolderFormModal({ open, folder, onClose, onSaved }: { open: boolean; folder?: FolderLite; onClose: () => void; onSaved: () => void }) {
  return open ? <FolderFormInner folder={folder} onClose={onClose} onSaved={onSaved} /> : null;
}

function FolderFormInner({ folder, onClose, onSaved }: { folder?: FolderLite; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || !name.trim()) return;
    setSaving(true);
    const res = folder ? await updateFolder(folder.id, { name, color }) : await createFolder({ name, color });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast(folder ? "Pasta atualizada" : "Pasta criada");
    onSaved();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={folder ? "Editar pasta" : "Nova pasta"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>{folder ? "Salvar" : "Criar pasta"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome">
          <Input autoFocus value={name} maxLength={60} placeholder="Ex.: Clientes, Interno, Campanhas" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
        <Field group label="Cor">
          <ColorGrid value={color} onChange={(c) => c && setColor(c)} size={28} />
        </Field>
      </div>
    </Modal>
  );
}
