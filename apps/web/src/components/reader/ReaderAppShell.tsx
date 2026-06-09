"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  Clock,
  Compass,
  Home,
  Library,
  PenLine,
  Search,
  UserCircle,
} from "lucide-react";
import { setActiveRoleCookieClient } from "@/lib/active-role";

export type AuthorAccessMode = "switch" | "apply" | "pending" | "hidden";

const navItems = [
  {
    label: "Home",
    href: "/reader/home",
    icon: Home,
    matchers: ["/reader/home"],
  },
  {
    label: "Discover",
    href: "/reader/discover",
    icon: Compass,
    matchers: [
      "/reader/discover",
      "/reader/books",
      "/reader/lists",
      "/reader/authors",
      "/reader/genres",
    ],
  },
  {
    label: "Library",
    href: "/reader/library",
    icon: Library,
    matchers: ["/reader/library", "/reader/bookmarks"],
  },
];

const isPathActive = (pathname: string | null, matchers: string[]) => {
  if (!pathname) return false;
  return matchers.some(
    (matcher) =>
      pathname === matcher || pathname.startsWith(`${matcher}/`)
  );
};

export default function ReaderAppShell({
  children,
  authorAccess = "hidden",
}: {
  children: ReactNode;
  authorAccess?: AuthorAccessMode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isImmersive = Boolean(pathname?.startsWith("/reader/read"));

  if (isImmersive) {
    return (
      <div className="relative min-h-[100dvh] bg-[#EEEFF8] text-foreground dark:bg-[#050917]">
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#EEEFF8] text-foreground dark:bg-[#050917] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* ── Desktop sidebar ── */}
      <div className="hidden border-r border-[#ECEAF5] bg-white dark:border-white/10 dark:bg-[#070b14] lg:block">
      <aside className="pr-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
        <div className="px-5 pt-7 pb-6">
          <Link href="/reader/home" className="inline-flex items-center">
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

        <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3">
          {navItems.map((item) => {
            const active = isPathActive(pathname, item.matchers);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onMouseEnter={() => router.prefetch(item.href)}
                className={`inline-flex min-h-[44px] items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] transition-colors duration-150 ease-out ${
                  active
                    ? "bg-[#907AFF]/[0.09] font-medium text-[#907AFF] dark:bg-[#907AFF]/[0.14] dark:text-[#B8AAFF]"
                    : "font-normal text-[#8B92A5] hover:bg-black/[0.04] hover:text-[#1E2535] dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 px-3 py-5">
          <div className="flex flex-col gap-1.5">
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194] transition hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Search className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Search</span>
            </Link>
            <Link
              href="/reader/notifications"
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194] transition hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Bell className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Notifications</span>
            </Link>
            <Link
              href="/reader/profile"
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194] transition hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <UserCircle className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Profile</span>
            </Link>
          </div>
          {authorAccess === "switch" && (
            <button
              type="button"
              onClick={() => {
                setActiveRoleCookieClient("author");
                window.location.href = "/author/home";
              }}
              className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194] transition hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ArrowLeftRight className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Switch to Author</span>
            </button>
          )}
          {authorAccess === "apply" && (
            <Link
              href="/author/signup"
              className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194] transition hover:bg-[#F6F7FB] hover:text-[#555C70] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <PenLine className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Become an Author</span>
            </Link>
          )}
          {authorAccess === "pending" && (
            <div className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-[#7A8194]/60 dark:text-white/30">
              <Clock className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Application Pending</span>
            </div>
          )}
        </div>
      </aside>
      </div>

      {/* ── Main content ── */}
      <main className="relative mx-auto min-h-screen w-full max-w-[1400px] px-4 pb-24 pt-4 sm:px-5 sm:pt-6 lg:px-6 lg:pb-8 lg:pt-8">{children}</main>

      {/* ── Mobile bottom nav ── */}
      <nav
        aria-label="Reader navigation"
        className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-[#ECEAF5] bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#050917]/95 lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-6 pb-[calc(env(safe-area-inset-bottom,0)+0.5rem)] pt-2">
          {navItems.map((item) => {
            const active = isPathActive(pathname, item.matchers);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex flex-col items-center gap-1 px-3 py-1.5"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150 ${
                    active
                      ? "text-[#907AFF] dark:text-[#B8AAFF]"
                      : "text-[#8B92A5] group-hover:text-[#1E2535] dark:text-white/40 dark:group-hover:text-white/70"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[11px] transition-colors duration-150 ${
                    active
                      ? "font-semibold text-[#907AFF] dark:text-[#B8AAFF]"
                      : "font-medium text-[#8B92A5] dark:text-white/40"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
