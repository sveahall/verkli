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
  Globe,
  Languages,
  Pen,
  PenLine,
  Repeat,
  Settings,
  Sparkles,
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
/** Linear 6-step production flow: Write → Cover → Audio → Translate → Publish → Review */
const BOOK_WORKFLOW_TABS: ReadonlyArray<{
  key: string;
  label: string;
  panel: string | null; // null = default (edit/write)
  icon: LucideIcon;
  group: number;
}> = [
  { key: "edit", label: "Write", panel: null, icon: PenLine, group: 0 },
  { key: "cover", label: "Cover", panel: "cover", icon: ImageIcon, group: 0 },
  { key: "audiobook", label: "Audio", panel: "audiobook", icon: Headphones, group: 0 },
  { key: "translate", label: "Translate", panel: "translate", icon: Languages, group: 0 },
  { key: "publish", label: "Publish", panel: "publish", icon: Globe, group: 0 },
  { key: "review", label: "Review", panel: "review", icon: Sparkles, group: 0 },
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
      className={`group/nav relative flex w-full min-h-[44px] items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] font-normal transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        active
          ? "bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] text-white shadow-sm shadow-[#907AFF]/15"
          : "text-[#7A8194] hover:bg-[#F6F7FB] hover:text-[#555C70] hover:translate-x-0.5 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-[#907AFF] shadow-sm shadow-[#907AFF]/30" />
      )}
      <Icon className={`h-[18px] w-[18px] flex-shrink-0 transition-transform duration-200 ${active ? "" : "group-hover/nav:scale-110"}`} />
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

  /* Mobile bottom nav items — subset of main nav for one-hand reach */
  const mobileNavItems = AUTHOR_WORKFLOW_NAV.filter(
    (item) => ["home", "library", "production"].includes(item.key)
  );

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden border-r border-[#ECEAF5] pr-4 bg-white dark:border-white/10 dark:bg-[#070b14] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
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

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3">
          {AUTHOR_WORKFLOW_NAV.map((item) => {
            const active = isLeafActive(item, pathname);
            const workflowBookId = bookIdFromPath ?? currentBookId;
            const showWorkflowChildren =
              item.key === "production" && isOnBookPage && !!workflowBookId;

            return (
              <div key={item.key}>
                <SidebarNavLink
                  item={item}
                  href={resolveHref(item.href, item.bookScoped, currentBookId)}
                  active={active}
                />
                {showWorkflowChildren && (
                  <div className="mt-1">
                    <div className="mb-1 pl-7" title={activeBook?.title ?? "Book"}>
                      <span className="block truncate max-w-[160px] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30">
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
          <div className="flex flex-col gap-1.5">
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

      {/* ── Mobile bottom nav ── */}
      <nav
        aria-label="Author navigation"
        className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-[#ECEAF5] bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#050917]/95 lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2">
          {mobileNavItems.map((item) => {
            const active = isLeafActive(item, pathname);
            const Icon = ICONS[item.icon] ?? Home;
            return (
              <Link
                key={item.key}
                href={resolveHref(item.href, item.bookScoped, currentBookId)}
                aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center gap-1 px-3 py-1.5"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] text-white shadow-md shadow-[#907AFF]/20"
                      : "text-[#7A8194] group-hover:text-[#555C70] dark:text-white/40 dark:group-hover:text-white/70"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active
                      ? "text-[#907AFF]"
                      : "text-[#7A8194] dark:text-white/40"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          {/* Settings shortcut */}
          {AUTHOR_SIDEBAR_FOOTER.filter((item) => item.key === "settings").map((item) => {
            const active = isLeafActive(item, pathname);
            const Icon = ICONS[item.icon] ?? Settings;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center gap-1 px-3 py-1.5"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] text-white shadow-md shadow-[#907AFF]/20"
                      : "text-[#7A8194] group-hover:text-[#555C70] dark:text-white/40 dark:group-hover:text-white/70"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active
                      ? "text-[#907AFF]"
                      : "text-[#7A8194] dark:text-white/40"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
