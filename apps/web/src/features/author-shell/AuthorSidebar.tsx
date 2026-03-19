"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bot,
  Home,
  Megaphone,
  Settings,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AUTHOR_SIDEBAR_FOOTER,
  AUTHOR_WORKFLOW_NAV,
  type AuthorSidebarChildLink,
  type AuthorSidebarLink,
} from "@/nav/navConfig";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  library: BookOpen,
  production: Bot,
  audience: Megaphone,
  analytics: BarChart3,
  profile: UserCircle,
  settings: Settings,
};

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
    return (
      pathname.startsWith("/author/library") ||
      pathname.startsWith("/author/books") ||
      pathname.startsWith("/author/write")
    );
  }
  if (item.key === "profile") return pathname.startsWith("/author/profile");
  if (item.key === "settings") return pathname.startsWith("/author/settings");
  return pathname.startsWith(item.href);
}

function isChildActive(
  item: AuthorSidebarChildLink,
  pathname: string,
  searchParams: ReadonlyURLSearchParams
) {
  const [hrefPath, query = ""] = item.href.split("?");
  if (pathname !== hrefPath) return false;

  if (item.key === "assets") {
    return !searchParams.get("kind");
  }

  if (item.key === "campaigns") {
    const surface = searchParams.get("surface");
    return !surface || surface === "campaigns";
  }

  if (item.key === "overview") {
    const section = searchParams.get("section");
    return !section || section === "overview";
  }

  const params = new URLSearchParams(query);
  return Array.from(params.entries()).every(([key, value]) => searchParams.get(key) === value);
}

function SidebarLeafLink({
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

function SidebarChildLink({
  item,
  href,
  active,
}: {
  item: AuthorSidebarChildLink;
  href: string;
  active: boolean;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}

export default function AuthorSidebar() {
  const { state, activeBook, booksLoading } = useAuthorWorkspace();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentBookId = activeBook?.id ?? (booksLoading ? state.currentBookId : null);

  return (
    <aside className="border-b border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#070b14]/85 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r lg:border-black/[0.04] dark:lg:border-white/[0.08]">
      <div className="px-4 py-8 lg:px-5">
        <Link href="/author/home" className="inline-flex items-center">
          <div>
            <Image
              src="/logo-dark.svg"
              alt="Verkli"
              width={122}
              height={25}
              className="h-7 w-auto"
              priority
            />
          </div>
        </Link>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-4 pb-6 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
        {AUTHOR_WORKFLOW_NAV.map((item) => (
          item.children ? (
            <div key={item.key} className="space-y-1">
              <div
                className={`inline-flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  pathname.startsWith(item.href)
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-white/45"
                }`}
              >
                {(() => {
                  const Icon = ICONS[item.icon] ?? Home;
                  return <Icon className="h-4 w-4 flex-shrink-0" />;
                })()}
                <span className="font-medium">{item.label}</span>
              </div>
              <div className="space-y-1 pl-10">
                {item.children.map((child) => {
                  const href = resolveHref(child.href, child.bookScoped, currentBookId);
                  return (
                    <SidebarChildLink
                      key={child.key}
                      item={child}
                      href={href}
                      active={isChildActive(child, pathname, searchParams)}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <SidebarLeafLink
              key={item.key}
              item={item}
              href={resolveHref(item.href, item.bookScoped, currentBookId)}
              active={isLeafActive(item, pathname)}
            />
          )
        ))}
      </nav>

      <div className="border-t border-black/[0.06] px-4 py-4 dark:border-white/10 lg:px-3">
        <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {AUTHOR_SIDEBAR_FOOTER.map((item) => (
            <SidebarLeafLink
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
