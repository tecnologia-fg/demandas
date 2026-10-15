"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLive } from "@/components/live/LiveProvider";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Archive, CalendarDays, ChevronDown, Columns3, Copy, LayoutTemplate, Link2, List, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BoardData, CardSummary, ColumnData } from "@/lib/types";
import { Button, Input } from "@/components/ui/basics";
import { MenuItem, Popover, useFeedback } from "@/components/ui/overlay";
import { archiveBoard, archiveColumnCards, getBoardSnapshot, listBoardsForMove, toggleFavorite } from "@/app/actions/boards";
import { createColumn, deleteColumn, reorderColumns, updateColumn } from "@/app/actions/columns";
import { archiveCard, createCard, deleteCard, duplicateCard, moveCard, toggleComplete } from "@/app/actions/cards";
import { CardOverlay, type CardActions } from "./CardTile";
import { ColumnView, type ColumnActions } from "./ColumnView";
import { EMPTY_FILTERS, activeFilterCount, matches, type Filters } from "./filters";
import { FilterPanel } from "./FilterPanel";
import { ListView } from "./ListView";
import { CalendarView } from "./CalendarView";
import { CardModal } from "./CardModal";
import { ShareModal } from "@/components/share/ShareModal";
import { ArchivedModal, BoardCopyModal, BoardFormModal, DeleteColumnModal, NewCardModal } from "./BoardModals";
import { useLookups } from "./lookups";

type View = "quadro" | "lista" | "calendario";

function buildState(board: BoardData) {
  const cards: Record<string, CardSummary> = {};
  const order: Record<string, string[]> = {};
  for (const col of board.columns) order[col.id] = [];
  const sorted = [...board.cards].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  for (const c of sorted) {
    cards[c.id] = c;
    (order[c.columnId] ??= []).push(c.id);
  }
  return { columns: board.columns, cards, order };
}

export function BoardView({ board: initial, initialCardId }: { board: BoardData; initialCardId: string | null }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { me } = useLookups();
  const [meta, setMeta] = useState({ id: initial.id, name: initial.name, description: initial.description, color: initial.color, clientId: initial.clientId, favorite: initial.favorite });
  const [state, setState] = useState(() => buildState(initial));
  const [view, setView] = useState<View>("quadro");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openCard, setOpenCard] = useState<string | null>(initialCardId);
  const openCardRef = useRef(openCard);
  useLayoutEffect(() => {
    openCardRef.current = openCard;
  }, [openCard]);
  // links para uma demanda deste mesmo quadro (notificação, busca) mudam só o ?demanda=: abre sem recarregar
  const paramCard = useSearchParams().get("demanda");
  const [prevParam, setPrevParam] = useState(paramCard);
  if (paramCard !== prevParam) {
    setPrevParam(paramCard);
    if (paramCard && paramCard !== openCard) setOpenCard(paramCard);
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "new" | "edit" | "archived" | "duplicate" | "saveTemplate" | "share" | { deleteColumn: string; count: number }>(null);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState(0);
  const boardScroll = useRef<HTMLDivElement>(null);

  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const busy = useRef(0);
  const dragType = useRef<"card" | "column" | null>(null);
  const origin = useRef<{ col: string; index: number } | null>(null);

  // ---------- sincronização com a equipe ----------
  // Atualização ao vivo: cada mudança no quadro (de qualquer pessoa) chega por /api/ao-vivo e o quadro recarrega a
  // foto do servidor. Enquanto há ação em andamento ou arraste, a recarga espera e roda logo depois.
  const pendingRefresh = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (busy.current > 0 || dragType.current) {
      pendingRefresh.current = true;
      return;
    }
    const res = await getBoardSnapshot(initial.id);
    if (!res.ok) return;
    if (busy.current > 0 || dragType.current) {
      pendingRefresh.current = true;
      return;
    }
    pendingRefresh.current = false;
    setState(buildState(res.data));
    setMeta((m) => ({ ...m, name: res.data.name, description: res.data.description, color: res.data.color, clientId: res.data.clientId }));
  }, [initial.id]);

  const scheduleRefresh = useCallback(
    (delay = 250) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(), delay);
    },
    [refresh],
  );

  useLive((e) => {
    if (e.type === "board" && (!e.boardId || e.boardId === initial.id)) scheduleRefresh();
  });

  useEffect(() => {
    // reserva, caso a conexão ao vivo caia sem o navegador perceber
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => {
      clearInterval(t);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  /** Roda uma ação no servidor; se falhar, avisa e recarrega o quadro. */
  const act = useCallback(
    async <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T | null> => {
      busy.current++;
      try {
        const res = await fn();
        if (!res.ok) {
          toast(res.error, "error");
          pendingRefresh.current = true;
          return null;
        }
        return res.data;
      } finally {
        busy.current--;
        if (busy.current === 0 && pendingRefresh.current) scheduleRefresh(120);
      }
    },
    [toast, scheduleRefresh],
  );

  // ---------- estado local ----------
  /**
   * Aplica uma demanda vinda do servidor (completa) ou só os campos que mudaram (parcial, vinda da janela da
   * demanda). Parcial nunca muda coluna nem posição: assim a janela aberta não desfaz o que outra pessoa moveu.
   */
  const upsertCard = useCallback(
    (c: CardSummary | (Partial<CardSummary> & { id: string })) => {
      setState((s) => {
        const prev = s.cards[c.id];
        const full = "boardId" in c && "columnId" in c && "position" in c;
        if (!full) {
          if (!prev) return s;
          const { columnId: _c, position: _p, boardId: _b, ...rest } = c as Partial<CardSummary>;
          void _c;
          void _p;
          void _b;
          return { ...s, cards: { ...s.cards, [c.id]: { ...prev, ...rest } } };
        }
        const card = c as CardSummary;
        const cards = { ...s.cards };
        const order = { ...s.order };
        if (card.archivedAt || card.boardId !== initial.id) {
          delete cards[card.id];
          if (prev) order[prev.columnId] = (order[prev.columnId] ?? []).filter((x) => x !== card.id);
          return { ...s, cards, order };
        }
        cards[card.id] = card;
        if (!prev || prev.columnId !== card.columnId) {
          if (prev) order[prev.columnId] = (order[prev.columnId] ?? []).filter((x) => x !== card.id);
          // o servidor numera as posições da coluna 0..n: a posição devolvida é o índice (negativa = topo)
          const list = (order[card.columnId] ?? []).filter((x) => x !== card.id);
          list.splice(Math.max(0, Math.min(card.position, list.length)), 0, card.id);
          order[card.columnId] = list;
        }
        return { ...s, cards, order };
      });
    },
    [initial.id],
  );

  const removeCardLocal = useCallback((id: string) => {
    setState((s) => {
      const prev = s.cards[id];
      if (!prev) return s;
      const cards = { ...s.cards };
      delete cards[id];
      return { ...s, cards, order: { ...s.order, [prev.columnId]: s.order[prev.columnId].filter((x) => x !== id) } };
    });
  }, []);

  const openCardModal = useCallback((id: string | null) => {
    setOpenCard(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("demanda", id);
    else url.searchParams.delete("demanda");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const cardActions: CardActions = useMemo(
    () => ({
      columns: state.columns.map((c) => ({ id: c.id, name: c.name, color: c.color, isDone: c.isDone })),
      moveTo: async (id, columnId) => {
        const data = await act(() => moveCard({ cardId: id, toColumnId: columnId, toIndex: 0 }));
        if (!data) return;
        upsertCard(data.card);
        if (data.spawned) {
          upsertCard(data.spawned);
          toast(`Demanda concluída. Próxima repetição criada (#${data.spawned.number})`);
        } else {
          toast(`Movida para ${state.columns.find((c) => c.id === columnId)?.name ?? "a coluna"}`);
        }
      },
      open: (id) => openCardModal(id),
      toggleComplete: async (id) => {
        const data = await act(() => toggleComplete(id));
        if (data) {
          upsertCard(data.card);
          if (data.spawned) {
            upsertCard(data.spawned);
            toast(`Próxima repetição criada (#${data.spawned.number})`);
          }
        }
      },
      duplicate: async (id) => {
        const data = await act(() => duplicateCard(id));
        if (data) {
          setState((s) => {
            const order = { ...s.order };
            const list = [...order[data.columnId]];
            list.splice(list.indexOf(id) + 1, 0, data.id);
            order[data.columnId] = list;
            return { ...s, cards: { ...s.cards, [data.id]: data }, order };
          });
          toast("Demanda duplicada");
        }
      },
      archive: async (id) => {
        const data = await act(() => archiveCard(id, true));
        if (data) {
          removeCardLocal(id);
          toast("Demanda arquivada", "ok", {
            label: "Desfazer",
            run: async () => {
              const back = await act(() => archiveCard(id, false));
              if (back) upsertCard(back);
            },
          });
        }
      },
      remove: async (id) => {
        const card = stateRef.current.cards[id];
        const ok = await confirm({ title: "Excluir demanda?", text: `"${card?.title ?? ""}" some para sempre, com comentários e anexos. Se quiser só tirar do quadro, arquive.`, confirm: "Excluir", danger: true });
        if (!ok) return;
        const res = await act(() => deleteCard(id));
        if (res === null) return;
        removeCardLocal(id);
        if (openCardRef.current === id) openCardModal(null);
      },
    }),
    [act, upsertCard, removeCardLocal, toast, confirm, openCardModal, state.columns],
  );

  const columnActions: ColumnActions = useMemo(
    () => ({
      rename: async (id, name) => {
        setState((s) => ({ ...s, columns: s.columns.map((c) => (c.id === id ? { ...c, name } : c)) }));
        await act(() => updateColumn(id, { name }));
      },
      patch: async (id, patch) => {
        setState((s) => ({ ...s, columns: s.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
        await act(() => updateColumn(id, patch));
      },
      remove: async (id) => {
        const visible = (stateRef.current.order[id] ?? []).length;
        if (visible > 0) return setModal({ deleteColumn: id, count: visible });
        const col = stateRef.current.columns.find((c) => c.id === id);
        const ok = await confirm({ title: "Excluir coluna?", text: `A coluna "${col?.name}" vai sair do quadro.`, confirm: "Excluir", danger: true });
        if (!ok) return;
        const res = await act(() => deleteColumn(id, null));
        if (!res) return;
        // tinha demandas arquivadas: pergunta para onde vão (nunca apaga junto)
        if (res.needsTarget) return setModal({ deleteColumn: id, count: res.count });
        setState((s) => ({ ...s, columns: s.columns.filter((c) => c.id !== id) }));
      },
      archiveAll: async (columnId) => {
        const count = (stateRef.current.order[columnId] ?? []).length;
        if (count === 0) return toast("Não há demandas nesta coluna.");
        const col = stateRef.current.columns.find((c) => c.id === columnId);
        const ok = await confirm({ title: `Arquivar ${count} ${count === 1 ? "demanda" : "demandas"}?`, text: `Todas as demandas de "${col?.name}" saem do quadro. Dá para restaurar em Demandas arquivadas.`, confirm: "Arquivar" });
        if (!ok) return;
        const res = await act(() => archiveColumnCards(columnId));
        if (res === null) return;
        setState((s) => {
          const cards = { ...s.cards };
          for (const id of s.order[columnId] ?? []) delete cards[id];
          return { ...s, cards, order: { ...s.order, [columnId]: [] } };
        });
        toast(`${res} ${res === 1 ? "demanda arquivada" : "demandas arquivadas"}`);
      },
      addCard: async (columnId, title, atTop, open) => {
        const data = await act(() => createCard({ boardId: initial.id, columnId, title, atTop }));
        if (!data) return false;
        setState((s) => {
          const list = (s.order[columnId] ?? []).filter((x) => x !== data.id);
          if (atTop) list.unshift(data.id);
          else list.push(data.id);
          return { ...s, cards: { ...s.cards, [data.id]: data }, order: { ...s.order, [columnId]: list } };
        });
        if (open) openCardModal(data.id);
        return true;
      },
    }),
    [act, confirm, initial.id, openCardModal, toast],
  );

  // ---------- filtros ----------
  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(state.cards)) if (matches(c, filters)) set.add(c.id);
    return set;
  }, [state.cards, filters]);
  const filterCount = activeFilterCount(filters);
  const onlyMine = filters.assignees.length === 1 && filters.assignees[0] === me.id;

  // teclas rápidas do quadro: N = nova demanda, / = filtrar (fora de campos de texto e janelas)
  const filterInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setModal("new");
      } else if (e.key === "/") {
        e.preventDefault();
        filterInput.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const allCards = useMemo(() => Object.values(state.cards), [state.cards]);

  // ---------- arrastar e soltar ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string) => {
    if (id.startsWith("col-")) return id.slice(4);
    if (id.startsWith("drop-")) return id.slice(5);
    const s = stateRef.current;
    return Object.keys(s.order).find((col) => s.order[col].includes(id)) ?? null;
  };

  const collision: CollisionDetection = useCallback((args) => {
    if (dragType.current === "column") {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith("col-")) });
    }
    const pointer = pointerWithin(args);
    const hits = pointer.length ? pointer : rectIntersection(args);
    const cardHits = hits.filter((h) => !String(h.id).startsWith("col-") && !String(h.id).startsWith("drop-"));
    if (cardHits.length) {
      const ids = new Set(cardHits.map((h) => h.id));
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => ids.has(c.id)) });
    }
    const body = hits.find((h) => String(h.id).startsWith("drop-")) ?? hits.find((h) => String(h.id).startsWith("col-"));
    return body ? [body] : [];
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    dragType.current = id.startsWith("col-") ? "column" : "card";
    setActiveId(id);
    if (dragType.current === "card") {
      const col = findContainer(id)!;
      origin.current = { col, index: stateRef.current.order[col].indexOf(id) };
    }
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (dragType.current !== "card" || !over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    const from = findContainer(aId);
    const to = findContainer(oId);
    if (!from || !to || from === to) return;
    setState((s) => {
      const fromList = s.order[from].filter((x) => x !== aId);
      const toList = [...s.order[to]];
      let idx = toList.indexOf(oId);
      if (idx < 0) idx = toList.length;
      else {
        const r = active.rect.current.translated;
        if (r && r.top > over.rect.top + over.rect.height / 2) idx += 1;
      }
      toList.splice(idx, 0, aId);
      return { ...s, order: { ...s.order, [from]: fromList, [to]: toList } };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const type = dragType.current;
    dragType.current = null;
    setActiveId(null);
    if (pendingRefresh.current) scheduleRefresh(400);
    const aId = String(active.id);
    if (!over) {
      if (type === "card") void refresh();
      return;
    }
    const oId = String(over.id);

    if (type === "column") {
      if (aId === oId) return;
      const cols = stateRef.current.columns;
      const next = arrayMove(cols, cols.findIndex((c) => `col-${c.id}` === aId), cols.findIndex((c) => `col-${c.id}` === oId));
      setState((s) => ({ ...s, columns: next }));
      await act(() => reorderColumns(initial.id, next.map((c) => c.id)));
      return;
    }

    const col = findContainer(aId);
    if (!col) return;
    let list = stateRef.current.order[col];
    const overIndex = list.indexOf(oId);
    const curIndex = list.indexOf(aId);
    if (overIndex >= 0 && overIndex !== curIndex) list = arrayMove(list, curIndex, overIndex);
    const index = list.indexOf(aId);
    const card = stateRef.current.cards[aId];
    setState((s) => ({ ...s, order: { ...s.order, [col]: list }, cards: { ...s.cards, [aId]: { ...card, columnId: col } } }));
    if (origin.current && origin.current.col === col && origin.current.index === index) return;
    const data = await act(() => moveCard({ cardId: aId, toColumnId: col, toIndex: index }));
    if (data) {
      setState((s) => ({ ...s, cards: { ...s.cards, [aId]: data.card } }));
      if (data.spawned) {
        upsertCard(data.spawned);
        toast(`Demanda concluída. Próxima repetição criada (#${data.spawned.number})`);
      } else if (origin.current?.col !== col) {
        const target = stateRef.current.columns.find((c) => c.id === col);
        if (target?.isDone && data.card.completedAt) toast("Demanda concluída");
      }
    }
  };

  const activeCard = activeId && !activeId.startsWith("col-") ? state.cards[activeId] : null;

  const addingColumn = useRef(false);
  const addColumn = async () => {
    const name = newColumn?.trim();
    if (!name) return setNewColumn(null);
    if (addingColumn.current) return;
    addingColumn.current = true;
    const data = await act(() => createColumn(initial.id, name));
    addingColumn.current = false;
    if (data) {
      setState((s) => ({ ...s, columns: [...s.columns, data], order: { ...s.order, [data.id]: [] } }));
      setNewColumn("");
    }
  };

  return (
    <div className="flex h-[calc(100dvh-68px)] flex-col lg:h-[calc(100dvh-72px)]">
      {/* Cabeçalho do quadro */}
      <div className="grid gap-3 px-4 pb-3 pt-4 lg:gap-4 lg:px-6 lg:pb-4 lg:pt-5">
        <div className="flex items-center gap-2">
          <BoardSwitcher meta={meta} />
          <button
            type="button"
            aria-label={meta.favorite ? "Tirar dos favoritos" : "Favoritar quadro"}
            onClick={async () => {
              setMeta((m) => ({ ...m, favorite: !m.favorite }));
              await act(() => toggleFavorite(initial.id));
              router.refresh();
            }}
            className={cn("inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-surface", meta.favorite ? "text-accent-strong" : "text-fg-3")}
          >
            <Star className="size-[18px]" fill={meta.favorite ? "currentColor" : "none"} />
          </button>
          <BoardMenu
            isAdmin={me.isAdmin}
            onEdit={() => setModal("edit")}
            onArchived={() => setModal("archived")}
            onDuplicate={() => setModal("duplicate")}
            onSaveTemplate={() => setModal("saveTemplate")}
            onShare={() => setModal("share")}
            onArchiveBoard={async () => {
              const ok = await confirm({ title: "Arquivar quadro?", text: "O quadro sai da lista, mas nada é apagado. Dá para restaurar em Configurações.", confirm: "Arquivar" });
              if (!ok) return;
              const res = await act(() => archiveBoard(initial.id, true));
              if (res !== null) router.push("/quadros");
            }}
          />
        </div>
        {meta.description && <p className="-mt-2 hidden max-w-2xl text-sm text-fg-2 sm:block">{meta.description}</p>}

        <div className="flex items-center gap-2 sm:flex-wrap">
          <div className="glass-strong flex h-10 shrink-0 items-center rounded-full p-1 sm:h-11" role="tablist" aria-label="Visualização">
            {([
              ["quadro", "Quadro", Columns3],
              ["lista", "Lista", List],
              ["calendario", "Calendário", CalendarDays],
            ] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                aria-label={label}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[13.5px] font-medium transition-colors sm:h-9 sm:px-3.5",
                  view === v ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-1 items-center justify-end gap-1.5 min-w-max sm:gap-2">
            <button
              type="button"
              aria-label="Filtrar neste quadro"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((v) => !v);
                setTimeout(() => filterInput.current?.focus(), 30);
              }}
              className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11 lg:hidden", searchOpen || filters.q ? "bg-panel text-panel-fg" : "glass-strong text-fg-2")}
            >
              <Search className="size-4" />
            </button>
            <div className={cn("glass-strong h-11 w-full max-w-[240px] items-center gap-2 rounded-full px-3.5", "hidden lg:flex")}>
              <Search className="size-4 shrink-0 text-fg-3" />
              <input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                ref={filterInput}
                placeholder="Filtrar neste quadro ( / )"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3"
              />
              {filters.q && (
                <button type="button" aria-label="Limpar" onClick={() => setFilters((f) => ({ ...f, q: "" }))} className="text-fg-3 hover:text-fg">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-pressed={onlyMine}
              title="Só as demandas em que estou"
              onClick={() => setFilters((f) => ({ ...f, assignees: onlyMine ? [] : [me.id] }))}
              className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-[13.5px] font-medium transition-colors sm:h-11 sm:px-4", onlyMine ? "bg-panel text-panel-fg" : "glass-strong text-fg-2 hover:text-fg")}
            >
              <UserRound className="size-4" />
              <span className="hidden md:inline">Só as minhas</span>
            </button>
            <FilterButton filters={filters} setFilters={setFilters} count={filterCount} />
            <Button variant="dark" className="h-10 shrink-0 px-3 sm:h-11 sm:px-4" aria-label="Nova demanda" onClick={() => setModal("new")}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nova demanda</span>
            </Button>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="animate-pop -mt-1 px-4 pb-3 lg:hidden">
          <div className="glass-strong flex h-11 items-center gap-2 rounded-full px-3.5">
            <Search className="size-4 shrink-0 text-fg-3" />
            <input
              ref={filterInput}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Filtrar neste quadro"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
            />
            <button type="button" aria-label="Fechar busca" onClick={() => { setFilters((f) => ({ ...f, q: "" })); setSearchOpen(false); }} className="text-fg-3">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Celular: abas das colunas (toque leva até a coluna; a aba ativa acompanha o deslizar) */}
      {view === "quadro" && state.columns.length > 0 && (
        <ColumnTabs
          columns={state.columns.map((c) => ({ ...c, count: (state.order[c.id] ?? []).filter((id) => visible.has(id)).length }))}
          active={activeColumn}
          onPick={(i) => {
            const el = boardScroll.current?.querySelector<HTMLElement>(`[data-col-index="${i}"]`);
            el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
          }}
        />
      )}

      {/* Conteúdo */}
      {view === "quadro" && (
        <DndContext id={`board-${initial.id}`} sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { dragType.current = null; setActiveId(null); void refresh(); }}>
          <div
            ref={boardScroll}
            onScroll={(e) => {
              const el = e.currentTarget;
              const first = el.querySelector<HTMLElement>("[data-col-index]");
              if (!first) return;
              const step = first.offsetWidth + 16;
              setActiveColumn(Math.max(0, Math.min(state.columns.length - 1, Math.round(el.scrollLeft / step))));
            }}
            className="board-scroll flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 lg:snap-none lg:px-6"
          >
            <SortableContext items={state.columns.map((c) => `col-${c.id}`)} strategy={horizontalListSortingStrategy}>
              {state.columns.map((col, i) => (
                <ColumnView
                  key={col.id}
                  index={i}
                  column={col}
                  cards={(state.order[col.id] ?? []).filter((id) => visible.has(id)).map((id) => state.cards[id])}
                  totalCount={(state.order[col.id] ?? []).length}
                  cardActions={cardActions}
                  actions={columnActions}
                />
              ))}
            </SortableContext>
            <div className="w-[calc(100vw-48px)] shrink-0 snap-start sm:w-[300px]">
              {newColumn === null ? (
                <button type="button" onClick={() => setNewColumn("")} className="glass flex h-14 w-full items-center justify-center gap-2 rounded-[26px] text-sm font-medium text-fg-2 transition-colors hover:text-fg">
                  <Plus className="size-4" /> Nova coluna
                </button>
              ) : (
                <div className="glass grid gap-2 rounded-[26px] p-3">
                  <Input autoFocus value={newColumn} maxLength={60} placeholder="Nome da coluna" onChange={(e) => setNewColumn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addColumn(); if (e.key === "Escape") setNewColumn(null); }} />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setNewColumn(null)}>Cancelar</Button>
                    <Button size="sm" variant="primary" onClick={addColumn}>Criar coluna</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>{activeCard ? <CardOverlay card={activeCard} /> : null}</DragOverlay>
        </DndContext>
      )}
      {view === "lista" && (
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-4 pb-6 lg:px-6">
          <ListView columns={state.columns} order={state.order} cards={state.cards} visible={visible} actions={cardActions} />
        </div>
      )}
      {view === "calendario" && (
        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-4 pb-6 lg:px-6">
          <CalendarView cards={allCards.filter((c) => visible.has(c.id))} onOpen={(id) => openCardModal(id)} onChange={upsertCard} />
        </div>
      )}

      {openCard && (
        <CardModal
          key={openCard}
          cardId={openCard}
          onClose={() => openCardModal(null)}
          onChange={upsertCard}
          onRemoved={(id) => {
            removeCardLocal(id);
            openCardModal(null);
          }}
          onOpenOther={(id) => openCardModal(id)}
        />
      )}

      <NewCardModal
        open={modal === "new"}
        onClose={() => setModal(null)}
        boardId={initial.id}
        boardClientId={meta.clientId}
        columns={state.columns}
        onCreated={(c) => {
          upsertCard(c);
          setModal(null);
          openCardModal(c.id);
        }}
      />
      <BoardFormModal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        board={meta}
        onSaved={(m) => {
          setMeta((x) => ({ ...x, ...m }));
          setModal(null);
          router.refresh();
        }}
      />
      {(modal === "duplicate" || modal === "saveTemplate") && (
        <BoardCopyModal
          mode={modal}
          boardId={initial.id}
          boardName={meta.name}
          onClose={() => setModal(null)}
          onDone={(newId) => {
            setModal(null);
            if (newId) router.push(`/quadros/${newId}`);
          }}
        />
      )}
      <ShareModal open={modal === "share"} boardId={initial.id} boardName={meta.name} onClose={() => setModal(null)} />
      <ArchivedModal open={modal === "archived"} onClose={() => setModal(null)} boardId={initial.id} onRestored={upsertCard} />
      {modal && typeof modal === "object" && state.columns.some((c) => c.id === modal.deleteColumn) && (
        <DeleteColumnModal
          column={state.columns.find((c) => c.id === modal.deleteColumn)!}
          columns={state.columns}
          count={modal.count}
          onClose={() => setModal(null)}
          onConfirm={async (moveTo) => {
            const id = modal.deleteColumn;
            setModal(null);
            const res = await act(() => deleteColumn(id, moveTo));
            if (res !== null) await refresh();
          }}
        />
      )}
    </div>
  );
}

function BoardSwitcher({ meta }: { meta: { id: string; name: string; color: string } }) {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<{ id: string; name: string; color: string }[] | null>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={async () => {
          setOpen((v) => !v);
          if (!boards) {
            const res = await listBoardsForMove();
            if (res.ok) setBoards(res.data);
          }
        }}
        className="group flex min-w-0 items-center gap-3 rounded-2xl py-1 pr-2 text-left"
      >
        <span className="size-3.5 shrink-0 rounded-full" style={{ background: meta.color }} />
        <h1 className="truncate text-[26px] font-semibold tracking-tight lg:text-[30px]">{meta.name}</h1>
        <ChevronDown className="size-5 shrink-0 text-fg-3 transition-colors group-hover:text-fg" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300}>
        {!boards && <p className="px-3 py-3 text-sm text-fg-3">Carregando...</p>}
        {boards?.map((b) => (
          <MenuItem key={b.id} active={b.id === meta.id} icon={<span className="block size-3 rounded-full" style={{ background: b.color }} />} onClick={() => { setOpen(false); router.push(`/quadros/${b.id}`); }}>
            {b.name}
          </MenuItem>
        ))}
        <div className="my-1 h-px bg-border" />
        <MenuItem icon={<Plus />} onClick={() => { setOpen(false); router.push("/quadros?novo=1"); }}>Novo quadro</MenuItem>
      </Popover>
    </>
  );
}

function BoardMenu({
  isAdmin,
  onEdit,
  onArchived,
  onArchiveBoard,
  onDuplicate,
  onSaveTemplate,
  onShare,
}: {
  isAdmin: boolean;
  onEdit: () => void;
  onArchived: () => void;
  onArchiveBoard: () => void;
  onDuplicate: () => void;
  onSaveTemplate: () => void;
  onShare: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <button ref={ref} type="button" aria-label="Opções do quadro" onClick={() => setOpen((v) => !v)} className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface hover:text-fg">
        <MoreHorizontal className="size-5" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240}>
        <MenuItem icon={<Pencil />} onClick={run(onEdit)}>Editar quadro</MenuItem>
        <MenuItem icon={<Copy />} onClick={run(onDuplicate)}>Duplicar quadro</MenuItem>
        <MenuItem icon={<LayoutTemplate />} onClick={run(onSaveTemplate)}>Salvar como modelo</MenuItem>
        <MenuItem icon={<Archive />} onClick={run(onArchived)}>Demandas arquivadas</MenuItem>
        {isAdmin && (
          <>
            <MenuItem icon={<Link2 />} onClick={run(onShare)}>Compartilhar com cliente</MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem icon={<Trash2 />} danger onClick={run(onArchiveBoard)}>Arquivar quadro</MenuItem>
          </>
        )}
      </Popover>
    </>
  );
}

function FilterButton({ filters, setFilters, count }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; count: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-[13.5px] font-medium transition-colors sm:h-11 sm:px-4", count ? "bg-accent text-accent-ink" : "glass-strong text-fg-2 hover:text-fg")}
      >
        <SlidersHorizontal className="size-4" />
        <span className="hidden sm:inline">Filtros</span>
        {count > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-ink text-[11px] font-bold text-accent">{count}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340} align="end" className="p-3">
        <FilterPanel filters={filters} setFilters={setFilters} />
      </Popover>
    </>
  );
}

export type { ColumnData };

/** Abas das colunas no celular (estilo apps de tarefas): nome + contagem, rolagem lateral, ativa em destaque. */
function ColumnTabs({ columns, active, onPick }: { columns: (ColumnData & { count: number })[]; active: number; onPick: (i: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);
  return (
    <div ref={strip} className="-mt-1 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Colunas">
      {columns.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          data-tab={i}
          aria-selected={i === active}
          onClick={() => onPick(i)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-full pl-2.5 pr-3 text-[13px] font-medium transition-colors",
            i === active ? "bg-panel text-panel-fg" : "glass-strong text-fg-2",
          )}
        >
          <span className="size-2 rounded-full" style={{ background: c.isDone ? "var(--success)" : c.color ?? "var(--fg-3)" }} />
          {c.name}
          <span className={cn("tabular-nums", i === active ? "text-panel-fg-2" : "text-fg-3")}>{c.count}</span>
        </button>
      ))}
    </div>
  );
}
