"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const mobileNavItems = [
  {
    label: "Home",
    href: "/reader/home",
    activeMatchers: ["/reader/home"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.5h15M4.5 12h15M4.5 17.5h10" />
      </svg>
    ),
  },
  {
    label: "Discover",
    href: "/reader/discover",
    activeMatchers: [
      "/reader/discover",
      "/reader/books",
      "/reader/lists",
      "/reader/authors",
      "/reader/genres",
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8L12 3.5z" />
      </svg>
    ),
  },
  {
    label: "Library",
    href: "/reader/library",
    activeMatchers: ["/reader/library", "/reader/bookmarks"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5.5h11a3 3 0 013 3v10H8a3 3 0 00-3 3v-16z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 18.5h11" />
      </svg>
    ),
  },
  {
    label: "Bookmarks",
    href: "/reader/bookmarks",
    activeMatchers: ["/reader/bookmarks"],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4.75h10a2 2 0 0 1 2 2V19l-7-3-7 3V6.75a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
];

const isPathActive = (pathname: string | null, matchers: string[]) => {
  if (!pathname) return false;
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`));
};

export default function ReaderAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isImmersive = Boolean(
    pathname?.startsWith("/reader/read") || pathname?.startsWith("/reader/books")
  );

  return (
    <div
      className={
        isImmersive
          ? "relative min-h-[100dvh]"
          : "relative min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-[#07070c] dark:via-[#0b0b12] dark:to-[#0f111a]"
      }
    >
      {!isImmersive && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 right-[-8rem] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />
          <div className="absolute top-[30%] left-[-6rem] h-80 w-80 rounded-full bg-amber-200/30 blur-3xl dark:bg-violet-500/10" />
          <div className="absolute bottom-[-10rem] right-[10%] h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-500/10" />
        </div>
      )}

      {isImmersive ? (
        <div className="relative">{children}</div>
      ) : (
        <main className="page-content relative pb-24 pt-8 sm:pt-10 lg:pb-12">
          {children}
        </main>
      )}

      {!isImmersive && (
        <nav
          aria-label="Reader navigation"
          className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-slate-200/80 bg-white/90 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-lg dark:border-white/10 dark:bg-[#0b0b12]/90 lg:hidden"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-[calc(env(safe-area-inset-bottom,0)+0.75rem)] pt-3">
            {mobileNavItems.map((item) => {
              const active = isPathActive(pathname, item.activeMatchers);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12] ${
                    active
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:text-white/60 dark:hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                      active
                        ? "bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
