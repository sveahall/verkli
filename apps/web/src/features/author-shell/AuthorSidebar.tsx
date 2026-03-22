"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Gift,
  Home,
  Pen,
  Repeat,
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
  production: Pen,
  audience: Gift,
  analytics: BarChart3,
  profile: UserCircle,
  settings: Settings,
  "switch-to-reader": Repeat,
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
      className={`inline-flex min-h-[44px] items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] font-normal transition ${
        active
          ? "bg-gradient-to-r from-[#907AFF] to-[#7C6CFF] text-white shadow-[0_6px_16px_rgba(124,108,255,0.24)]"
          : "text-[#7A8194] hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
      }`}
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AuthorSidebar() {
  const { state, activeBook, booksLoading } = useAuthorWorkspace();
  const pathname = usePathname();
  const currentBookId = activeBook?.id ?? (booksLoading ? state.currentBookId : null);

  return (
    <aside className="border-r border-[#ECEAF5] bg-white dark:border-white/10 dark:bg-[#070b14] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
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
        {AUTHOR_WORKFLOW_NAV.map((item) => (
          <SidebarNavLink
            key={item.key}
            item={item}
            href={resolveHref(item.href, item.bookScoped, currentBookId)}
            active={isLeafActive(item, pathname)}
          />
        ))}
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
