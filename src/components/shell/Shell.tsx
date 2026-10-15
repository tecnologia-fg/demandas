"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Building2, CalendarDays, ChevronDown, Folder, House, LayoutGrid, LogOut, Menu, Monitor, Moon, Plus, Search, Settings, Star, Sun, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, LogoMark } from "@/components/Logo";
import { Avatar, Kbd } from "@/components/ui/basics";
import { MenuLabel, Popover } from "@/components/ui/overlay";
import { logout } from "@/app/actions/auth";
import { NotificationBell } from "./NotificationBell";
import { SearchDialog } from "./SearchDialog";
import { LiveProvider } from "@/components/live/LiveProvider";
import { GlassSlider } from "@/components/ui/GlassSlider";

type ShellUser = { id: string; name: string; email: string; color: string; initials: string; isAdmin: boolean; avatarUrl?: string | null };
type ShellBoard = { id: string; name: string; color: string; favorite: boolean; folderId: string | null };
type ShellFolder = { id: string; name: string; color: string };

const NAV = [
  { href: "/", label: "Início", icon: House },
  { href: "/quadros", label: "Quadros", icon: LayoutGrid },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/aprovacoes", label: "Aprovações", icon: BadgeCheck },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Shell({ user, boards, folders, unread, children }: { user: ShellUser; boards: ShellBoard[]; folders: ShellFolder[]; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMobileOpen(false);
  }

  const sortedBoards = [...boards.filter((b) => b.favorite), ...boards.filter((b) => !b.favorite)];
  // com pastas, o menu agrupa os quadros: primeiro os soltos, depois cada pasta com os seus
  const folderIds = new Set(folders.map((f) => f.id));
  const groups: { folder: ShellFolder | null; boards: ShellBoard[] }[] = [
    { folder: null, boards: sortedBoards.filter((b) => !b.folderId || !folderIds.has(b.folderId)) },
    ...folders.map((f) => ({ folder: f, boards: sortedBoards.filter((b) => b.folderId === f.id) })),
  ].filter((g) => g.boards.length > 0);

  return (
    <LiveProvider>
    <div className="min-h-dvh lg:pl-[104px]">
      {/* Trilho de ícones flutuante (computador) */}
      <aside className="glass fixed bottom-4 left-4 top-4 z-40 hidden w-[72px] flex-col items-center gap-2 rounded-[28px] py-4 shadow-md lg:flex">
        <Link href="/" aria-label="Dmanda, início" className="mb-4">
          <LogoMark size={40} />
        </Link>
        <nav className="flex flex-col items-center gap-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <RailLink key={href} href={href} label={label} active={isActive(pathname, href)}>
              <Icon className="size-5" strokeWidth={1.9} />
            </RailLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeButton />
          <UserMenu user={user} compact />
        </div>
      </aside>

      {/* Topo */}
      <header className="sticky top-0 z-30 px-3 pt-3 lg:px-6 lg:pt-4">
        <div className="glass-strong flex h-14 items-center gap-1.5 rounded-full pl-2 pr-1.5 shadow-sm lg:gap-2 lg:pl-1.5">
          <Link href="/" aria-label="Dmanda, início" className="mr-auto pl-3.5 lg:hidden">
            <Logo size={23} />
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-11 w-full max-w-[380px] items-center gap-2.5 rounded-full bg-surface/80 px-4 text-[14px] text-fg-3 transition-colors hover:text-fg-2 lg:flex"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar demanda</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="hidden flex-1 lg:block" />
          <button type="button" aria-label="Buscar demanda" onClick={() => setSearchOpen(true)} className="inline-flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface lg:hidden">
            <Search className="size-[18px]" />
          </button>
          <NotificationBell initialUnread={unread} />
          <div className="hidden lg:block">
            <UserMenu user={user} />
          </div>
          <button
            type="button"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className={cn("inline-flex size-10 items-center justify-center rounded-full lg:hidden", mobileOpen ? "bg-panel text-panel-fg" : "text-fg-2 hover:bg-surface")}
          >
            {mobileOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[76px] z-30 lg:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMobileOpen(false)} />
          <div className="animate-pop relative mx-3 grid max-h-[calc(100dvh-6rem)] gap-4 overflow-y-auto rounded-card bg-surface p-3 shadow-lg">
            <nav className="grid grid-cols-2 gap-1.5">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex h-11 items-center gap-2.5 rounded-2xl px-3.5 text-[14px] font-medium",
                    isActive(pathname, href) ? "bg-accent text-accent-ink" : "bg-surface-2 text-fg",
                  )}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="grid gap-0.5">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Quadros</span>
                <Link href="/quadros?novo=1" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-fg-2 hover:bg-surface-2">
                  <Plus className="size-3.5" /> Novo
                </Link>
              </div>
              {groups.map((g) => (
                <div key={g.folder?.id ?? "soltos"} className="grid gap-0.5">
                  {g.folder && (
                    <p className="flex items-center gap-2 px-3 pb-0.5 pt-2 text-[12px] font-semibold text-fg-3">
                      <Folder className="size-3.5" style={{ color: g.folder.color }} />
                      <span className="min-w-0 truncate">{g.folder.name}</span>
                    </p>
                  )}
                  {g.boards.map((b) => (
                    <Link key={b.id} href={`/quadros/${b.id}`} className={cn("flex h-10 items-center gap-3 rounded-xl px-3 text-[14px]", pathname === `/quadros/${b.id}` ? "bg-surface-2 font-medium" : "text-fg-2")}>
                      <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      {b.favorite && <Star className="size-3.5 text-fg-3" fill="currentColor" />}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <div className="min-w-0 flex-1"><UserMenu user={user} /></div>
              <ThemeButton />
            </div>
          </div>
        </div>
      )}

      <main id="conteudo" className="min-w-0">{children}</main>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
    </LiveProvider>
  );
}

function RailLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative inline-flex size-12 items-center justify-center rounded-full transition-colors",
        active ? "bg-accent text-accent-ink shadow-md" : "text-fg-2 hover:bg-surface hover:text-fg",
      )}
    >
      {children}
      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-panel px-3 py-1.5 text-xs font-medium text-panel-fg opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

function readTheme(): "light" | "dark" | "system" {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

function applyTheme(value: "light" | "dark" | "system") {
  const root = document.documentElement;
  if (value === "system") {
    root.removeAttribute("data-theme");
    document.cookie = "demanda_theme=; path=/; max-age=0; samesite=lax";
  } else {
    root.setAttribute("data-theme", value);
    document.cookie = `demanda_theme=${value}; path=/; max-age=31536000; samesite=lax`;
  }
}

function ThemeButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<"light" | "dark" | "system">("system");
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Tema"
        title="Tema"
        onClick={() => {
          setCurrent(readTheme());
          setOpen((v) => !v);
        }}
        className="inline-flex size-11 items-center justify-center rounded-full text-fg-2 hover:bg-surface hover:text-fg"
      >
        <Icon className="size-5" strokeWidth={1.9} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240}>
        <MenuLabel>Tema</MenuLabel>
        {([
          ["light", "Claro", Sun],
          ["dark", "Escuro", Moon],
          ["system", "Igual ao sistema", Monitor],
        ] as const).map(([v, label, I]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              applyTheme(v);
              setCurrent(v);
              setOpen(false);
            }}
            className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2", current === v && "bg-surface-2 font-medium")}
          >
            <I className="size-4 text-fg-2" /> {label}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <MenuLabel>Vidro</MenuLabel>
        <GlassSlider compact />
      </Popover>
    </>
  );
}

function UserMenu({ user, compact }: { user: ShellUser; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Minha conta"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full transition-colors hover:bg-surface",
          compact ? "p-1" : "h-11 w-full bg-surface/80 py-1 pl-1 pr-3",
        )}
      >
        <Avatar user={user} size={compact ? 38 : 34} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[14px] font-medium">{user.name.split(" ")[0]}</span>
            <ChevronDown className="size-4 text-fg-3" />
          </>
        )}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={250} align={compact ? "start" : "end"}>
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-fg-3">{user.email}</p>
        </div>
        <Link href="/perfil" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2">
          <UserRound className="size-4 text-fg-2" /> Meu perfil
        </Link>
        <div className="my-1 h-px bg-border" />
        <form action={logout}>
          <button type="submit" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-danger hover:bg-surface-2">
            <LogOut className="size-4" /> Sair
          </button>
        </form>
      </Popover>
    </>
  );
}
