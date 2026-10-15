"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Mention from "@tiptap/extension-mention";
import {
  Bold, Code, Heading2, Heading3, Highlighter, Italic, Link2, List, ListChecks, ListOrdered, Quote, RemoveFormatting, Strikethrough, Underline,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserLite } from "@/lib/types";
import { shapeColors } from "@/lib/color";

// Editor de texto formatado (Tiptap). Colar de Google Docs, Word ou de páginas da internet mantém negrito,
// itálico, títulos, listas, citações e links; o resto é descartado aqui e de novo no servidor (sanitizeRich).

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  variant?: "full" | "compact";
  autoFocus?: boolean;
  mentionUsers?: UserLite[];
  onSubmit?: () => void;
  minHeight?: number;
  className?: string;
};

export function RichEditor({ value, onChange, placeholder, variant = "full", autoFocus, mentionUsers, onSubmit, minHeight = 120, className }: Props) {
  const submitRef = useRef(onSubmit);
  // lista de pessoas lida pelo @ (fora do React, para o editor não precisar ser recriado)
  const [mentionSource] = useState(() => createMentionSource());
  useEffect(() => {
    submitRef.current = onSubmit;
    mentionSource.set(mentionUsers ?? []);
  });

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    content: value || "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      ...(mentionUsers
        ? [
            Mention.configure({
              HTMLAttributes: { class: "mention" },
              suggestion: {
                char: "@",
                items: ({ query }) => mentionSource.search(query),
                render: mentionPopup,
              },
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: { class: "rich rich-editor", "aria-label": placeholder ?? "Texto" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && submitRef.current) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--focus)]", className)}>
      {editor && <Toolbar editor={editor} variant={variant} />}
      <div className="max-h-[50vh] overflow-y-auto scroll-thin px-3.5 py-2.5" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, variant }: { editor: Editor; variant: "full" | "compact" }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("code"),
      mark: e.isActive("highlight"),
      link: e.isActive("link"),
    }),
  });

  const chain = () => editor.chain().focus();
  const buttons: [keyof typeof state, string, React.ReactNode, () => void, boolean?][] = [
    ["bold", "Negrito (⌘B)", <Bold key="b" />, () => chain().toggleBold().run()],
    ["italic", "Itálico (⌘I)", <Italic key="i" />, () => chain().toggleItalic().run()],
    ["underline", "Sublinhado (⌘U)", <Underline key="u" />, () => chain().toggleUnderline().run()],
    ["strike", "Riscado", <Strikethrough key="s" />, () => chain().toggleStrike().run(), true],
    ["mark", "Marca-texto", <Highlighter key="m" />, () => chain().toggleHighlight().run()],
    ["h2", "Título", <Heading2 key="h2" />, () => chain().toggleHeading({ level: 2 }).run(), true],
    ["h3", "Subtítulo", <Heading3 key="h3" />, () => chain().toggleHeading({ level: 3 }).run(), true],
    ["bullet", "Lista", <List key="l" />, () => chain().toggleBulletList().run()],
    ["ordered", "Lista numerada", <ListOrdered key="o" />, () => chain().toggleOrderedList().run()],
    ["task", "Lista de tarefas", <ListChecks key="t" />, () => chain().toggleTaskList().run(), true],
    ["quote", "Citação", <Quote key="q" />, () => chain().toggleBlockquote().run(), true],
    ["code", "Código", <Code key="c" />, () => chain().toggleCode().run(), true],
  ];

  const applyLink = () => {
    const v = url.trim();
    if (!v) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^(https?:|mailto:)/i.test(v) ? v : `https://${v}` }).run();
    setLinkOpen(false);
  };

  return (
    <div className="border-b border-border bg-surface-2/60">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1" role="toolbar" aria-label="Formatação">
        {buttons
          .filter(([, , , , fullOnly]) => variant === "full" || !fullOnly)
          .map(([key, label, icon, run]) => (
            <ToolButton key={key} label={label} active={state[key]} onClick={run}>
              {icon}
            </ToolButton>
          ))}
        <ToolButton
          label="Link"
          active={state.link}
          onClick={() => {
            setUrl((editor.getAttributes("link").href as string) ?? "");
            setLinkOpen((v) => !v);
          }}
        >
          <Link2 />
        </ToolButton>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <ToolButton label="Limpar formatação" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting />
        </ToolButton>
      </div>
      {linkOpen && (
        <div className="animate-pop flex items-center gap-1.5 px-2 pb-2">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setLinkOpen(false);
              }
            }}
            placeholder="Cole o endereço (vazio tira o link)"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
          />
          <button type="button" onClick={applyLink} className="h-8 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink">
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors [&>svg]:size-4",
        active ? "bg-accent text-accent-ink" : "text-fg-2 hover:bg-surface hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function createMentionSource() {
  let users: UserLite[] = [];
  return {
    set: (list: UserLite[]) => {
      users = list;
    },
    search: (query: string) => users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
  };
}

/** Lista de sugestões do @ (DOM simples, posicionada no cursor). */
function mentionPopup() {
  let el: HTMLDivElement | null = null;
  let items: UserLite[] = [];
  let index = 0;
  let pick: ((u: UserLite) => void) | null = null;

  const draw = () => {
    if (!el) return;
    el.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "px-2.5 py-2 text-sm text-fg-3";
      empty.textContent = "Ninguém com esse nome";
      el.appendChild(empty);
      return;
    }
    items.forEach((u, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cn("flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm", i === index && "bg-surface-2");
      const dot = document.createElement("span");
      dot.className = "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold";
      dot.style.background = shapeColors(u.color).bg;
      dot.style.color = shapeColors(u.color).fg;
      dot.textContent = u.initials;
      const name = document.createElement("span");
      name.textContent = u.name;
      b.append(dot, name);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick?.(u);
      });
      el!.appendChild(b);
    });
  };

  const place = (rect: DOMRect | null | undefined) => {
    if (!el || !rect) return;
    const top = rect.bottom + 6 + 220 > window.innerHeight ? rect.top - 6 - el.offsetHeight : rect.bottom + 6;
    el.style.top = `${Math.max(8, top)}px`;
    el.style.left = `${Math.min(rect.left, window.innerWidth - 264)}px`;
  };

  type P = { items: UserLite[]; command: (attrs: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null };
  const update = (props: P) => {
    items = props.items;
    index = Math.min(index, Math.max(0, items.length - 1));
    pick = (u) => props.command({ id: u.id, label: u.name });
    draw();
    place(props.clientRect?.());
  };

  return {
    onStart: (props: P) => {
      el = document.createElement("div");
      el.className = "animate-pop fixed z-[95] grid w-64 gap-0.5 rounded-2xl border border-border bg-surface p-1.5 shadow-lg";
      document.body.appendChild(el);
      index = 0;
      update(props);
    },
    onUpdate: update,
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowDown") {
        index = (index + 1) % Math.max(1, items.length);
        draw();
        return true;
      }
      if (event.key === "ArrowUp") {
        index = (index - 1 + items.length) % Math.max(1, items.length);
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (items[index]) pick?.(items[index]);
        return true;
      }
      if (event.key === "Escape") {
        el?.remove();
        el = null;
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}

/** Mostra o HTML já limpo pelo servidor. */
export function RichContent({ html, className }: { html: string; className?: string }) {
  return <div className={cn("rich", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
