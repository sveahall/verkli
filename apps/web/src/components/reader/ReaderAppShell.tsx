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
      <div className="dark relative min-h-[100dvh] bg-[#080C18] text-foreground">
        {children}
      </div>
    );
  }

  return (
    <div className="dark relative min-h-[100dvh] bg-[#080C18] text-foreground lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* ── Desktop sidebar — minimal chrome ── */}
      <div className="hidden border-r border-white/[0.06] bg-[#0B0F1E]/80 lg:block">
        <aside className="pr-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
          <div className="px-5 pt-7 pb-6">
            <Link href="/reader/home" className="inline-flex items-center">
              <Image
                src="/logo-dark.svg"
                alt="Verkli"
                width={100}
                height={22}
                className="h-[22px] w-auto brightness-0 invert"
                priority
              />
            </Link>
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
                  className={`inline-flex min-h-[40px] items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-normal transition-colors duration-150 ${
                    active
                      ? "bg-[#907AFF] text-white"
                      : "text-white/45 hover:bg-white/[0.06] hover:text-white/80"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex-shrink-0 px-3 py-5">
            <div className="mb-4 h-px bg-white/[0.06]" />
            <div className="flex flex-col gap-1">
              <Link
                href="/reader/discover"
                className="inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/35 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60"
              >
                <Search className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">Search</span>
              </Link>
              <Link
                href="/reader/notifications"
                className="inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/35 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60"
              >
                <Bell className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">Notifications</span>
              </Link>
              <Link
                href="/reader/profile"
                className="inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/35 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60"
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
                className="mt-1 inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/35 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60"
              >
                <ArrowLeftRight className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">Switch to Author</span>
              </button>
            )}
            {authorAccess === "apply" && (
              <Link
                href="/author/signup"
                className="mt-1 inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/35 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/60"
              >
                <PenLine className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">Become an Author</span>
              </Link>
            )}
            {authorAccess === "pending" && (
              <div className="mt-1 inline-flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-white/20">
                <Clock className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">Application Pending</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Main content ── */}
      <main className="page-content relative min-h-screen pb-24 pt-6 sm:pt-8 lg:pb-8 lg:pt-10">{children}</main>

      {/* ── Mobile bottom nav ── */}
      <nav
        aria-label="Reader navigation"
        className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-white/[0.06] bg-[#080C18]/95 backdrop-blur-2xl lg:hidden"
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
                      ? "bg-[#907AFF] text-white"
                      : "text-white/35 group-hover:text-white/60"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active ? "text-[#907AFF]" : "text-white/35"
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
