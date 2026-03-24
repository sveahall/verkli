"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Gift,
  Headphones,
  Home,
  ImageIcon,
  FileDown,
  Globe,
  Languages,
  Megaphone,
  Pen,
  PenLine,
  Printer,
  Repeat,
  Settings,
  Sparkles,
  Tag,
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
  production: Pen,
  audience: Gift,
  analytics: BarChart3,
  profile: UserCircle,
  settings: Settings,
  "switch-to-reader": Repeat,
};

/*
 * Book workflow tabs — shown as nested items under Production
 * when the user is working on a specific book.
 */
const BOOK_WORKFLOW_TABS: ReadonlyArray<{
  key: string;
  label: string;
  panel: string | null; // null = default (edit/write)
  icon: LucideIcon;
  group: number;
}> = [
  { key: "edit", label: "Write", panel: null, icon: PenLine, group: 0 },
  { key: "polish", label: "Polish", panel: "polish", icon: Sparkles, group: 0 },
  { key: "cover", label: "Cover", panel: "cover", icon: ImageIcon, group: 0 },
  { key: "translate", label: "Translate", panel: "translate", icon: Languages, group: 1 },
  { key: "audiobook", label: "Audiobook", panel: "audiobook", icon: Headphones, group: 1 },
  { key: "print", label: "Print", panel: "print", icon: Printer, group: 1 },
  { key: "pricing", label: "Pricing", panel: "pricing", icon: Tag, group: 2 },
  { key: "publish", label: "Publish", panel: "publish", icon: Globe, group: 2 },
  { key: "market", label: "Market", panel: "market", icon: Megaphone, group: 2 },
  { key: "statistics", label: "Stats", panel: "statistics", icon: BarChart3, group: 3 },
  { key: "import", label: "Import", panel: "import", icon: FileDown, group: 3 },
];

function resolveHref(
  href: string,
  bookScoped: boolean | undefined,
  currentBookId: string | null
) {
  if (!bookScoped || !currentBookId) return href;

  const [pathname, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("bookId", currentBookId);
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function isLeafActive(item: AuthorSidebarLink, pathname: string) {
  if (item.key === "home") return pathname.startsWith("/author/home");
  if (item.key === "library") {
    return pathname.startsWith("/author/library");
  }
  if (item.key === "production") {
    return (
      pathname.startsWith("/author/production") ||
      pathname.startsWith("/author/books") ||
      pathname.startsWith("/author/write")
    );
  }
  if (item.key === "profile") return pathname.startsWith("/author/profile");
  if (item.key === "settings") return pathname.startsWith("/author/settings");
  if (item.key === "switch-to-reader") return false;
  return pathname.startsWith(item.href);
}

function SidebarNavLink({
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

  const handleClick =
    item.key === "switch-to-reader"
      ? () => setActiveRoleCookieClient("reader")
      : undefined;

  return (
    <Link
      href={href}
      onClick={handleClick}
      onMouseEnter={() => router.prefetch(href)}
      className={`flex w-full min-h-[44px] items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] font-normal transition ${
        active
          ? "bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] text-white"
          : "text-[#7A8194] hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function BookWorkflowNav({ bookId, isOnBookPage }: { bookId: string; isOnBookPage: boolean }) {
  const searchParams = useSearchParams();
  const rawPanel = searchParams.get("panel")?.trim() || null;
  // Only highlight a tab when actually on the book editor page
  const activePanel = isOnBookPage ? (rawPanel ?? "edit") : null;

  return (
    <div className="flex flex-col gap-0.5 pb-1 pl-4">
      {BOOK_WORKFLOW_TABS.map((tab, i) => {
        const isActive =
          tab.panel === null
            ? activePanel === "edit"
            : activePanel === tab.panel;
        const href =
          tab.panel === null
            ? `/author/books/${bookId}`
            : `/author/books/${bookId}?panel=${tab.panel}`;
        const Icon = tab.icon;
        const prevTab = i > 0 ? BOOK_WORKFLOW_TABS[i - 1] : null;
        const showDivider = prevTab !== null && prevTab.group !== tab.group;

        return (
          <div key={tab.key}>
            {showDivider && (
              <div
                className="my-1 ml-3 mr-2 h-px bg-slate-100 dark:bg-white/[0.06]"
                aria-hidden
              />
            )}
            <Link
              href={href}
              className={`inline-flex min-h-[34px] items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                isActive
                  ? "bg-[#907AFF]/10 text-[#5132de] dark:bg-[#907AFF]/15 dark:text-[#cfbfff]"
                  : "text-[#8B91A5] hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
              }`}
            >
              <Icon
                className={`h-[14px] w-[14px] flex-shrink-0 ${
                  isActive
                    ? "text-[#7c5cfc] dark:text-[#a78bfa]"
                    : "text-[#B0B5C5] dark:text-white/25"
                }`}
              />
              <span className="truncate">{tab.label}</span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function AuthorSidebar() {
  const { state, activeBook } = useAuthorWorkspace();
  const pathname = usePathname();
  const currentBookId = activeBook?.id ?? state.currentBookId;
  const isOnBookPage = pathname.startsWith("/author/books/");
  const bookIdFromPath = isOnBookPage
    ? pathname.match(/^\/author\/books\/([^/?]+)/)?.[1] ?? null
    : null;

  return (
    <aside className="border-r border-[#ECEAF5] pr-4 bg-white dark:border-white/10 dark:bg-[#070b14] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="px-5 pt-7 pb-6">
        <Link href="/author/home" className="inline-flex items-center">
          <Image
            src="/logo-dark.svg"
            alt="Verkli"
            width={120}
            height={26}
            className="h-[26px] w-auto"
            priority
          />
        </Link>
      </div>

      <nav className="flex gap-1.5 overflow-x-auto px-3 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:px-3">
        {AUTHOR_WORKFLOW_NAV.map((item) => {
          const active = isLeafActive(item, pathname);
          const workflowBookId = bookIdFromPath ?? currentBookId;
          const showWorkflowChildren =
            item.key === "production" && active && !!workflowBookId;

          return (
            <div key={item.key}>
              <SidebarNavLink
                item={item}
                href={resolveHref(item.href, item.bookScoped, currentBookId)}
                active={active}
              />
              {showWorkflowChildren && (
                <div className="mt-1">
                  <div className="mb-1 pl-7">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-white/30">
                      {activeBook?.title ?? "Book"}
                    </span>
                  </div>
                  <BookWorkflowNav bookId={workflowBookId} isOnBookPage={isOnBookPage} />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-5">
        <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {AUTHOR_SIDEBAR_FOOTER.map((item) => (
            <SidebarNavLink
              key={item.key}
              item={item}
              href={item.href}
              active={isLeafActive(item, pathname)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
