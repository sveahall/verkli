"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Home,
  Megaphone,
  PenSquare,
  Settings,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AUTHOR_SIDEBAR_FOOTER,
  AUTHOR_WORKFLOW_NAV,
  type AuthorSidebarLink,
} from "@/nav/navConfig";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import { setActiveRoleCookieClient } from "@/lib/active-role";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  library: BookOpen,
  write: PenSquare,
  production: Bot,
  audience: Megaphone,
  analytics: BarChart3,
  notifications: Bell,
  profile: UserCircle,
  settings: Settings,
};

function resolveHref(item: AuthorSidebarLink, currentBookId: string | null) {
  if (!item.bookScoped || !currentBookId) return item.href;
  return `${item.href}?book=${currentBookId}`;
}

function SidebarLink({
  item,
  href,
  active,
}: {
  item: AuthorSidebarLink;
  href: string;
  active: boolean;
}) {
  const router = useRouter();
  const Icon = ICONS[item.icon] ?? Home;

  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      className={`inline-flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AuthorSidebar() {
  const { state, activeBook, booksLoading } = useAuthorWorkspace();
  const currentBookId = activeBook?.id ?? (booksLoading ? state.currentBookId : null);

  return (
    <aside className="border-b border-black/[0.06] bg-white/80 backdrop-blur dark:border-white/10 dark:bg-[#070b14]/80 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-4 lg:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
            Verkli
          </p>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Author
          </h1>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("author-shell:open-command-palette"))}
          className="inline-flex items-center rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-black/[0.14] hover:text-slate-900 dark:border-white/10 dark:text-white/45 dark:hover:text-white"
          aria-label="Open command palette"
        >
          Cmd K
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
        {AUTHOR_WORKFLOW_NAV.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            href={resolveHref(item, currentBookId)}
            active={state.activeWorkspace === item.key}
          />
        ))}
      </div>

      <div className="border-t border-black/[0.06] px-4 py-4 dark:border-white/10 lg:px-3">
        <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {AUTHOR_SIDEBAR_FOOTER.map((item) => (
            <SidebarLink
              key={item.key}
              item={item}
              href={item.href}
              active={false}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveRoleCookieClient("reader");
            window.location.href = "/reader/home";
          }}
          className="mt-3 inline-flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeftRight className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Byt till Läsare</span>
        </button>
      </div>
    </aside>
  );
}
