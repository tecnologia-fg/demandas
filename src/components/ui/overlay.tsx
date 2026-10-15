"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./basics";

// Escala de camadas: conteúdo < 30, topo 30, modal 70, popover 80, aviso 90.

const noop = () => () => {};
/** true só no navegador: portais (document.body) não existem na renderização do servidor. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = "start",
  width = 280,
  className,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "end";
  width?: number;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const mounted = useMounted();
  // mantém o painel montado durante a animação de saída
  const [shown, setShown] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setShown(true);
  }
  useEffect(() => {
    if (open || !shown) return;
    const t = setTimeout(() => setShown(false), 120);
    return () => clearTimeout(t);
  }, [open, shown]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      let left = align === "end" ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const h = panel.current?.offsetHeight ?? 300;
      const below = vh - a.bottom - 8;
      const above = a.top - 8;
      const top = below >= Math.min(h, 320) || below >= above ? a.bottom + 6 : Math.max(8, a.top - 6 - Math.min(h, above));
      setPos({ top, left, maxH: Math.max(160, (top > a.top ? below : above) - 6) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, align, width]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, onClose, anchor]);

  if (!shown || !mounted) return null;
  return createPortal(
    // O popover fica num portal, mas no React os eventos sobem pela árvore de componentes: sem isto, clicar num
    // item do menu do card também abria o card, e Enter/Espaço iniciavam o arraste da coluna ou do card.
    <div
      ref={panel}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(open ? "animate-pop" : "animate-pop-out pointer-events-none", "fixed z-[80] overflow-y-auto scroll-thin rounded-2xl border border-border bg-surface p-1.5 shadow-lg", className)}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width), maxHeight: pos?.maxH }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, active, hint }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; hint?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
        danger ? "text-danger hover:bg-surface-2" : "text-fg hover:bg-surface-2",
        active && "bg-surface-2 font-medium",
      )}
    >
      {icon && <span className={cn("shrink-0 [&>svg]:size-4", danger ? "text-danger" : "text-fg-2")}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-3">{children}</p>;
}

// Pilha de janelas abertas: só a de cima responde ao Esc, e a rolagem da página fica travada enquanto houver
// pelo menos uma (contador, não "guardar e restaurar", que destravava errado com janelas empilhadas).
const modalStack: string[] = [];
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function unlockScroll() {
  if (--scrollLocks <= 0) {
    scrollLocks = 0;
    document.body.style.overflow = savedOverflow;
  }
}

function isEditable(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || (tag === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable;
}

const EXIT_MS = 150;

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  bare,
  label,
  mobileFull,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  bare?: boolean;
  /** Nome acessível quando não há título visível (janelas `bare`). */
  label?: string;
  /** No celular, ocupa a tela inteira (janela da demanda). */
  mobileFull?: boolean;
}) {
  const id = useId();
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  /** Fechamento pedido pela pessoa (Esc, fundo, X): toca a saída e depois avisa quem abriu. */
  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      closeRef.current();
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    modalStack.push(id);
    lockScroll();
    const previousFocus = document.activeElement as HTMLElement | null;
    // foco para dentro da janela (se nada lá dentro pegou o foco sozinho)
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    }, 30);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (modalStack[modalStack.length - 1] !== id) return;
      // escrevendo num campo: o primeiro Esc só sai do campo (não perde o texto)
      const active = document.activeElement;
      if (isEditable(active) && panel.current?.contains(active)) {
        (active as HTMLElement).blur();
        panel.current?.focus();
        return;
      }
      e.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key);
      const i = modalStack.lastIndexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      unlockScroll();
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    };
  }, [open, id, requestClose]);

  if (!open || !mounted) return null;
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-start sm:p-6 sm:pt-[6vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={!bare && title ? `${id}-titulo` : undefined}
      aria-label={bare ? label : undefined}
    >
      <div className={cn("absolute inset-0 bg-overlay backdrop-blur-[2px]", closing ? "animate-fade-out" : "animate-fade-in")} onClick={requestClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-surface shadow-lg outline-none sm:max-h-[88vh] sm:rounded-card",
          mobileFull ? "h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto" : "max-h-[92dvh] rounded-t-card",
          closing ? "animate-sheet-out" : "animate-sheet",
          widths[size],
        )}
      >
        {!bare && (
          <div className="flex items-center gap-3 px-5 pb-2 pt-5 sm:px-6">
            <h2 id={`${id}-titulo`} className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
            <button type="button" onClick={requestClose} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg">
              <X className="size-5" />
            </button>
          </div>
        )}
        <ModalCloseCtx.Provider value={requestClose}>
          <div className={cn("min-h-0 flex-1 overflow-y-auto scroll-thin", !bare && "px-5 pb-5 sm:px-6")}>{children}</div>
        </ModalCloseCtx.Provider>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const ModalCloseCtx = createContext<(() => void) | null>(null);

/** Fecha a janela atual com a animação de saída (para botões "X" de janelas sem título). */
export function useModalClose() {
  return useContext(ModalCloseCtx);
}

// ---------- Avisos (toasts) e confirmação ----------

type Toast = { id: number; text: string; tone: "ok" | "error"; action?: { label: string; run: () => void } };
type ConfirmReq = { title: string; text?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void };

const Ctx = createContext<{
  toast: (text: string, tone?: "ok" | "error", action?: Toast["action"]) => void;
  confirm: (opts: Omit<ConfirmReq, "resolve">) => Promise<boolean>;
} | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok", action?: Toast["action"]) => {
    const idn = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id: idn, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== idn)), action ? 6000 : 3500);
  }, []);

  const confirm = useCallback((opts: Omit<ConfirmReq, "resolve">) => new Promise<boolean>((resolve) => setReq({ ...opts, resolve })), []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn("animate-pop pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg", t.tone === "error" ? "bg-danger text-white" : "bg-panel text-panel-fg")}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(req)}
        onClose={() => close(false)}
        title={req?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
            <Button variant={req?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>{req?.confirm}</Button>
          </>
        }
      >
        {req?.text && <p className="text-sm text-fg-2">{req.text}</p>}
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("FeedbackProvider ausente");
  return ctx;
}
