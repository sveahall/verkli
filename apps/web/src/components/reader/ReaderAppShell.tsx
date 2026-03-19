"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  Compass,
  Home,
  Library,
  Search,
  UserCircle,
} from "lucide-react";
import { setActiveRoleCookieClient } from "@/lib/active-role";

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

export default function ReaderAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isImmersive = Boolean(pathname?.startsWith("/reader/read"));

  if (isImmersive) {
    return (
      <div className="relative min-h-[100dvh] bg-[#f7f8fb] text-foreground dark:bg-[#030712]">
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#f7f8fb] text-foreground dark:bg-[#030712] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden border-r border-black/[0.06] bg-white/80 backdrop-blur dark:border-white/10 dark:bg-[#070b14]/80 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:pt-6">
        <div className="px-5 py-4">
          <Image
            src="/logo-dark.svg"
            alt="Verkli"
            width={796}
            height={221}
            className="h-5 w-auto"
            priority
          />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Reader
          </h1>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
          {navItems.map((item) => {
            const active = isPathActive(pathname, item.matchers);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onMouseEnter={() => router.prefetch(item.href)}
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
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-black/[0.06] px-3 py-4 dark:border-white/10">
          <div className="flex flex-col gap-1">
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Search className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Search</span>
            </Link>
            <Link
              href="/reader/notifications"
              className="inline-flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Bell className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Notifications</span>
            </Link>
            <Link
              href="/reader/profile"
              className="inline-flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <UserCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Profile</span>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveRoleCookieClient("author");
              window.location.href = "/author/home";
            }}
            className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeftRight className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Switch to Author</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="page-content relative pb-24 pt-6 sm:pt-8 lg:pb-8 lg:pt-10">{children}</main>

      {/* ── Mobile bottom nav ── */}
      <nav
        aria-label="Reader navigation"
        className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-black/[0.06] bg-white/92 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#050816]/92 lg:hidden"
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
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:bg-white dark:text-slate-900"
                      : "text-slate-400 group-hover:text-slate-700 dark:text-white/40 dark:group-hover:text-white/70"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-400 dark:text-white/40"
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
