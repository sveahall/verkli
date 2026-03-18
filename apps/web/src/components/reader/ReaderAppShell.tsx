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
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 10.25 12 4.5l7.25 5.75V19a1.25 1.25 0 0 1-1.25 1.25h-3.5v-5h-5v5H6A1.25 1.25 0 0 1 4.75 19v-8.75Z" />
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
        <circle cx="12" cy="12" r="7.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.75 9.25-3.35 7.1-1.7-4.05-4.05-1.7 7.1-3.35Z" />
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

  const isReaderHome = pathname === "/reader/home";

  return (
    <div
      className="relative min-h-[100dvh] bg-[#f7f8fb] text-foreground dark:bg-[#030712]"
    >
      {isImmersive ? (
        <div className="relative">{children}</div>
      ) : (
        <main
          className={`relative pb-24 lg:pb-12 ${isReaderHome ? "pt-0" : "page-content pt-8 sm:pt-10"}`}
        >
          {children}
        </main>
      )}

      {!isImmersive && (
        <nav
          aria-label="Reader navigation"
          className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-black/[0.06] bg-white/88 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#050816]/88 lg:hidden"
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
