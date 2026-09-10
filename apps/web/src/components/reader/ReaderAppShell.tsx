"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  BookMarked,
  Clock,
  Compass,
  Home,
  Library,
  LifeBuoy,
  PenLine,
  Search,
  UserCircle,
} from "lucide-react";
import { setActiveRoleCookieClient } from "@/lib/active-role";

export type AuthorAccessMode = "switch" | "apply" | "pending" | "hidden";

const navItems = [
  // In navItems on purpose, not in the desktop utility group. Both the sidebar
  // and the mobile bottom bar render this array, so the book cannot end up
  // reachable on one and not the other — which is exactly what happened when it
  // lived in the `hidden lg:block` sidebar, and what happened again on the
  // waitlist page's scroll cue before that.
  {
    label: "The book",
    href: "/waitlist",
    icon: BookMarked,
    matchers: ["/waitlist", "/order"],
  },
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
  footer,
}: {
  children: ReactNode;
  authorAccess?: AuthorAccessMode;
  /**
   * Site footer, passed in by the route-group layout rather than imported here
   * so it stays a server component. Signed-in readers previously had no route
   * to Privacy, Terms or Support from inside the app shell at all — the footer
   * only rendered on the public marketing layouts. Omitted on the immersive
   * reading view, where chrome below the text would break the page.
   */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isImmersive = Boolean(pathname?.startsWith("/reader/read"));

  if (isImmersive) {
    return (
      <div className="relative min-h-[100dvh] bg-background text-foreground">
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* ── Desktop sidebar ── */}
      <div className="hidden border-r border-border bg-card lg:block">
      <aside className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
        <div className="px-7 pb-8 pt-8">
          <Link href="/reader/home" className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Verkli reader home">
            <Image
              src="/logo-dark.svg"
              alt="Verkli"
              width={120}
              height={26}
              className="h-8 w-auto dark:brightness-0 dark:invert"
              priority
            />
          </Link>
          <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Your reading space</p>
        </div>

        <nav aria-label="Reader workspace" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4">
          {navItems.map((item) => {
            const active = isPathActive(pathname, item.matchers);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => router.prefetch(item.href)}
                className={`inline-flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-accent-foreground/15 bg-accent font-medium text-accent-foreground"
                    : "border-transparent font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 flex-shrink-0 border-t border-border py-5">
          <div className="flex flex-col gap-1.5">
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <Search className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Search</span>
            </Link>
            <Link
              href="/reader/notifications"
              aria-current={pathname === "/reader/notifications" ? "page" : undefined}
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <Bell className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Notifications</span>
            </Link>
            <Link
              href="/reader/profile"
              aria-current={pathname === "/reader/profile" ? "page" : undefined}
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <UserCircle className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Profile</span>
            </Link>
            <Link
              href="/support"
              aria-current={pathname === "/support" ? "page" : undefined}
              className="inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <LifeBuoy className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Support</span>
            </Link>
          </div>
          {authorAccess === "switch" && (
            <button
              type="button"
              onClick={() => {
                setActiveRoleCookieClient("author");
                window.location.href = "/author/home";
              }}
              className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <ArrowLeftRight className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Switch to Author</span>
            </button>
          )}
          {authorAccess === "apply" && (
            <Link
              href="/author/signup"
              className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card dark:hover:text-foreground"
            >
              <PenLine className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Become an Author</span>
            </Link>
          )}
          {authorAccess === "pending" && (
            <div className="mt-2 inline-flex min-h-[44px] w-full items-center gap-3.5 rounded-xl px-4 py-2.5 text-[15px] text-muted-foreground/60 dark:text-muted-foreground">
              <Clock className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="truncate">Application Pending</span>
            </div>
          )}
        </div>
      </aside>
      </div>

      {/* ── Main content ── */}
      <main
        className={`relative isolate mx-auto min-h-screen min-w-0 w-full max-w-[1360px] px-5 pt-6 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10 ${
          footer ? "pb-8 lg:pb-4" : "pb-24 lg:pb-8"
        }`}
      >
        {/* A static wash connects the workspace to the public brand. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(226,158,213,0.06),transparent_65%)]" />
        </div>
        {children}
      </main>

      {/* ── Site footer ──
          Spans both columns so it reads as the base of the whole shell. The
          extra bottom padding on small screens clears the fixed mobile nav. */}
      {footer ? (
        <div className="pb-20 lg:col-span-2 lg:pb-0">{footer}</div>
      ) : null}

      {/* ── Mobile bottom nav ── */}
      <nav
        aria-label="Reader navigation"
        data-reader-mobile-nav
        className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-border bg-card/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:bg-background/95 lg:hidden"
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
                className="group flex min-h-11 flex-col items-center gap-1 rounded-xl px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150 ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground group-hover:text-foreground dark:group-hover:text-muted-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={`text-[11px] transition-colors duration-150 ${
                    active
                      ? "font-semibold text-accent-foreground "
                      : "font-medium text-muted-foreground "
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
