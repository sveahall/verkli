"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { ArrowUpRight, Play, X } from "lucide-react";
import UserMenu from "@/components/navbar/UserMenu";
import NotificationBell from "@/components/notifications/NotificationBell";
import { createClient } from "@/lib/supabase/client";
import { getActiveRoleFromCookies, resolveActiveRoleFromProfile } from "@/lib/active-role";
import type { NavActions, NavLink } from "@/nav/navConfig";
import type { User } from "@supabase/supabase-js";
import {
  dropdownContent,
  dropdownHeaderMeta,
  dropdownItemMeta,
} from "./GlobalNavbar.dropdown-data";

const VERKLI_ROLE_KEY = "verkli_role";


/**
 * Global Navbar component
 * 
 * Placerad i components/navbar/ för att:
 * - Vara tillgänglig på alla sidor via layout
 * - Centralisera navbar logik och design
 * - Automatiskt visa rätt navigation baserat på route
 * - Hantera auth state globalt
 */
type GlobalNavbarProps = {
  navMode?: "author" | "reader" | "public";
  navLinks?: NavLink[];
  navActions?: NavActions;
  homeHref?: string;
};

export default function GlobalNavbar({
  navMode,
  navLinks,
  navActions,
  homeHref,
}: GlobalNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [currentRole, setCurrentRole] = useState<"author" | "reader">("author");
  const [canShowReaderAuthorCta, setCanShowReaderAuthorCta] = useState(true);
  // SECURITY: Track original signup role - readers can NEVER switch to author
  const [originalRole, setOriginalRole] = useState<"author" | "reader" | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const resolveRole = async (activeUser: User | null) => {
      if (!activeUser) {
        setCurrentRole("author");
        setOriginalRole(undefined);
        setCanShowReaderAuthorCta(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, preferences")
        .eq("user_id", activeUser.id)
        .maybeSingle();

      // SECURITY: Original signup role MUST come from profiles.role (DB).
      // Never trust user_metadata.role — it is client-writable via auth.updateUser().
      const profileRole = profile?.role;
      if (profileRole === "author" || profileRole === "reader") {
        setOriginalRole(profileRole);
      } else {
        setOriginalRole(undefined);
      }

      // Resolve active display role via the shared helper so the precedence
      // (preferences.active_role → profiles.role) stays consistent across
      // sign-in pages, auth/callback, and /api/auth/sync-role.
      const nextRole = resolveActiveRoleFromProfile(profile) ?? "author";
      setCurrentRole(nextRole);

      if (profileRole === "author") {
        setCanShowReaderAuthorCta(false);
        return;
      }

      const { data: application } = await supabase
        .from("author_applications")
        .select("status")
        .eq("user_id", activeUser.id)
        .maybeSingle();

      const applicationStatus = String((application as { status?: string } | null)?.status ?? "").toLowerCase();
      const hasActiveAuthorFlow = applicationStatus === "pending" || applicationStatus === "approved";
      setCanShowReaderAuthorCta(!hasActiveAuthorFlow);
    };

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await resolveRole(user);
      setLoading(false);
    };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Keep the last chosen experience across sign-outs so "/" can route
        // returning users directly to the correct sign-in flow.
        setUser(null);
        setCurrentRole("author");
        setOriginalRole(undefined);
      } else if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        void resolveRole(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Spara senast använd roll så att "/" kan omdirigera rätt (visa aldrig väljaren igen)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/author")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "author");
    } else if (pathname?.startsWith("/reader")) {
      window.localStorage.setItem(VERKLI_ROLE_KEY, "reader");
    }
  }, [pathname]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<{ key: string; top: number; left: number; pinned?: boolean; keyboard?: boolean } | null>(null);

  const logoHref = useMemo(() => {
    const role = getActiveRoleFromCookies();
    return role === "reader" ? "/reader/home" : role === "author" ? "/author/home" : homeHref ?? "/";
  }, [homeHref]);
  const dropdownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownPanelRef = useRef<HTMLDivElement | null>(null);
  const dropdownCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDropdownTimers = useCallback(() => {
    if (dropdownCloseTimeoutRef.current) clearTimeout(dropdownCloseTimeoutRef.current);
    if (dropdownHoverTimeoutRef.current) clearTimeout(dropdownHoverTimeoutRef.current);
  }, []);
  const closeDropdown = useCallback(() => {
    clearDropdownTimers();
    setDropdownOpen(null);
  }, [clearDropdownTimers]);
  const openDropdown = (trigger: HTMLButtonElement, key: string, pinned = false, keyboard = false) => {
    clearDropdownTimers();
    dropdownTriggerRef.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setDropdownOpen({ key, top: rect.bottom + 14, left: rect.left - 12, pinned, keyboard });
  };
  const focusDropdown = (last = false) => {
    requestAnimationFrame(() => {
      const links = dropdownPanelRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
      if (links?.length) links[last ? links.length - 1 : 0].focus();
    });
  };
  const leaveDropdown = () => {
    clearDropdownTimers();
    if (dropdownOpen?.pinned || dropdownPanelRef.current?.contains(document.activeElement)) return;
    dropdownCloseTimeoutRef.current = setTimeout(closeDropdown, 180);
  };
  const dropdownTriggerProps = (item: NavLink) => ({
    type: "button" as const,
    "aria-expanded": dropdownOpen?.key === item.label,
    "aria-controls": dropdownOpen?.key === item.label ? "verkli-nav-panel" : undefined,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (dropdownOpen?.key === item.label && dropdownOpen.pinned) closeDropdown();
      else {
        openDropdown(event.currentTarget, item.label, true, event.detail === 0);
        if (event.detail === 0) focusDropdown();
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openDropdown(event.currentTarget, item.label, true, true);
        focusDropdown(event.key === "ArrowUp");
      } else if (event.key === "Tab" && dropdownOpen?.key === item.label) {
        if (event.shiftKey) closeDropdown();
        else { event.preventDefault(); focusDropdown(); }
      }
    },
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "mouse" || dropdownOpen?.pinned) return;
      clearDropdownTimers();
      const trigger = event.currentTarget;
      dropdownHoverTimeoutRef.current = setTimeout(() => openDropdown(trigger, item.label), 100);
    },
    onPointerLeave: leaveDropdown,
  });
  useEffect(() => {
    if (!dropdownOpen) return;
    const inside = (target: EventTarget | null) => target instanceof Node &&
      (dropdownPanelRef.current?.contains(target) || dropdownTriggerRef.current?.contains(target));
    const dismissOutside = (event: Event) => { if (!inside(event.target)) closeDropdown(); };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
        dropdownTriggerRef.current?.focus();
      }
      const panel = dropdownPanelRef.current;
      if (!panel?.contains(document.activeElement)) return;
      const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 :
          (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links[next]?.focus();
      }
      if (event.key === "Tab" && ((event.shiftKey && index === 0) || (!event.shiftKey && index === links.length - 1))) {
        event.preventDefault();
        const trigger = dropdownTriggerRef.current;
        closeDropdown();
        const controls = Array.from(trigger?.closest("nav")?.querySelectorAll<HTMLElement>("a[href],button,input") ?? [])
          .filter((node) => node.getClientRects().length && !node.hasAttribute("disabled"));
        const next = trigger ? controls[controls.indexOf(trigger) + 1] : null;
        (event.shiftKey ? trigger : next ?? trigger)?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    window.addEventListener("resize", closeDropdown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      window.removeEventListener("resize", closeDropdown);
    };
  }, [dropdownOpen, closeDropdown]);
  useEffect(() => clearDropdownTimers, [clearDropdownTimers]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss navigation surfaces after navigation
    setMobileMenuOpen(false);
    closeDropdown();
  }, [pathname, closeDropdown]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeDesktop = () => { if (window.innerWidth >= 1024) setMobileMenuOpen(false); };
    window.addEventListener("resize", closeDesktop);
    return () => window.removeEventListener("resize", closeDesktop);
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };
  const resolvedMode =
    navMode ??
    (pathname?.startsWith("/author")
      ? "author"
      : pathname?.startsWith("/reader")
        ? "reader"
        : "public");
  const isauthorRoute = resolvedMode === "author";
  const isReaderRoute = resolvedMode === "reader";
  const isPublicPage = resolvedMode === "public";

  // För menyn: använd route när vi är i author/reader, annars använd roll från profilen
  const displayRoleForMenu: "author" | "reader" =
    isReaderRoute ? "reader" : isauthorRoute ? "author" : currentRole;

  // Keep auth screens clean; everything else uses the global navbar
  const isSelectorPage = pathname === "/";
  // Dölj navbar på selector-sidan (/) – ska bara synas på author, reader, signin, signup m.fl.
  const hideNavbar = isSelectorPage && !navMode;

  const defaultauthorNavItems: NavLink[] = [
    { label: "Features", href: "/author#features", hasDropdown: true },
    { label: "Integrations", href: "/author#integrations", hasDropdown: true },
    { label: "Examples", href: "/author#examples", hasDropdown: true },
    { label: "FAQ", href: "/author#faq", hasDropdown: true },
  ];

  const defaultReaderNavItems: NavLink[] = [
    { label: "Discover", href: "/reader/discover" },
    { label: "Categories", href: "/reader/discover" },
    { label: "Authors", href: "/reader/discover" },
    { label: "About", href: "/reader" },
  ];

  const defaultPublicNavItems: NavLink[] = [
    {
      label: "Product",
      href: "/product",
      hasDropdown: true,
      children: [
        { label: "Product", href: "/product" },
        { label: "How it works", href: "/how-it-works" },
      ],
    },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQ", href: "/faq" },
  ];

  const authorNavItems = isauthorRoute ? navLinks ?? defaultauthorNavItems : defaultauthorNavItems;
  const readerNavItems = isReaderRoute ? navLinks ?? defaultReaderNavItems : defaultReaderNavItems;
  const publicNavItems = isPublicPage ? navLinks ?? defaultPublicNavItems : defaultPublicNavItems;

  const primaryAction = navActions?.primary;
  const secondaryAction = navActions?.secondary;
  const shouldShowPrimaryAction = Boolean(primaryAction)
    && (!isReaderRoute || primaryAction?.href !== "/author/signup" || canShowReaderAuthorCta);
  // The authenticated author app now uses AuthorAppShell instead of GlobalNavbar.
  // Keep search defaults for reader/public flows only.
  const showSearch = navActions?.showSearch ?? isReaderRoute;
  const searchPlaceholder = navActions?.searchPlaceholder ?? "Search books, authors...";
  const searchHref = navActions?.searchHref ?? (isReaderRoute ? "/reader/home" : "/author");
  const showProfileMenu = navActions?.showProfileMenu ?? true;
  const isActiveReaderLink = (href: string) => {
    if (!pathname) return false;
    const matches = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

    if (href === "/reader/home") {
      return pathname === "/reader" || pathname === "/reader/home" || pathname === "/reader/feed";
    }
    if (href === "/reader/discover") {
      return (
        matches("/reader/discover") ||
        matches("/reader/books") ||
        matches("/reader/lists") ||
        matches("/reader/authors") ||
        matches("/reader/genres")
      );
    }
    if (href === "/reader/library") {
      return matches("/reader/library") || matches("/reader/bookmarks");
    }
    return matches(href);
  };

  if (loading || hideNavbar) {
    return null; // Don't show navbar while loading or on auth screens
  }

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchValue.trim();
    if (!query) return;

    // Attach query as ?q=... to author dashboard – page can consume detta
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("q", query);
    router.push(`${searchHref}?${params.toString()}`);
  };

  return (
    <>
      {/* fixed + isolate + z-[9999] så Safari alltid ritar navbar ovanpå innehåll (DOM-ordning + explicit stacking) */}
      <div className="fixed top-0 left-0 z-[9999] isolate w-full flex-shrink-0">
        <header className="mx-auto w-full max-w-[1680px] overflow-x-hidden overflow-y-visible px-4 pb-2 pt-3 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
        <div
          className="flex min-h-[68px] min-w-0 flex-1 items-center rounded-full border border-border bg-background/95 px-4 py-2 shadow-surface-sm backdrop-blur-xl sm:px-6 md:px-11"
        >
          <nav className="flex w-full min-w-0 items-center justify-between gap-4 sm:gap-6">
            {/* Logo and navigation */}
            <div className="flex min-w-0 items-center gap-4 sm:gap-10">
              {/* Logo: min 44px touch target on mobile */}
              <Link
                href={logoHref}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus:ring-offset-background"
              >
                <Image
                  src="/logo-dark.svg"
                  alt="Verkli"
                  width={796}
                  height={221}
                  className="h-8 w-auto dark:hidden"
                  priority
                />
                <Image
                  src="/favicon.svg"
                  alt="Verkli"
                  width={796}
                  height={221}
                  className="hidden h-8 w-auto dark:block"
                />
              </Link>

              {/* Navigation links based on route */}
              {isauthorRoute && (
                <div className="hidden items-center gap-5 text-[14px] font-medium text-foreground lg:flex">
                  {authorNavItems.map((item) => (
                    <div
                      key={item.label}
                      className="group relative"
                    >
                      {(item.hasDropdown ?? (item.children?.length ?? 0) > 0) ? (
                        <button
                          {...dropdownTriggerProps(item)}
                          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-3 py-2 transition-colors hover:text-foreground hover:text-[#7058DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 rounded-md"
                        >
                          <span>{item.label}</span>
                          <svg
                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${dropdownOpen?.key === item.label ? "rotate-180" : ""}`}
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          className="flex min-h-[44px] min-w-[44px] items-center px-3 py-2 transition-colors hover:text-foreground hover:text-[#7058DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 rounded-md"
                        >
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isReaderRoute && (
                <div className="hidden items-center gap-2 text-[14px] font-medium text-foreground lg:flex">
                  {readerNavItems.map((item) => {
                    const hasDropdown = item.hasDropdown ?? (item.children?.length ?? 0) > 0;
                    if (hasDropdown) {
                      return (
                        <div
                          key={item.label}
                          className="group relative"
                        >
                          <button
                          {...dropdownTriggerProps(item)}
                            className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full px-4 py-2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 "
                          >
                            <span>{item.label}</span>
                            <svg
                              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${dropdownOpen?.key === item.label ? "rotate-180" : ""}`}
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 4.5L6 7.5L9 4.5" />
                            </svg>
                          </button>
                        </div>
                      );
                    }
                    const active = Boolean(item.href) && isActiveReaderLink(item.href);
                    return (
                      <Link
                        key={item.label}
                        href={item.href || "#"}
                        aria-current={active ? "page" : undefined}
                        className={`rounded-full px-4 py-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          active
                            ? "bg-accent text-accent-foreground shadow-surface-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground "
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}

              {isPublicPage && (
                <div className="hidden items-center gap-6 text-[15px] font-medium text-foreground lg:flex">
                  {publicNavItems.map((item) => (
                    <div
                      key={item.label}
                      className="group relative"
                    >
                      {item.hasDropdown ? (
                        <button
                          {...dropdownTriggerProps(item)}
                          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-3 py-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus:ring-offset-transparent rounded-md"
                        >
                          <span>{item.label}</span>
                          <svg
                            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${dropdownOpen?.key === item.label ? "rotate-180" : ""}`}
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 4.5L6 7.5L9 4.5" />
                          </svg>
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          className="flex min-h-[44px] min-w-[44px] items-center px-3 py-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 rounded-md"
                        >
                          {item.label}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Hamburger – endast mobil/tablet, plats för menyn */}
              <button
                type="button"
                onClick={() => { closeDropdown(); setMobileMenuOpen((v) => !v); }}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 lg:hidden"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="verkli-mobile-navigation"
              >
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {(isauthorRoute || isReaderRoute) && user ? (
                <>
                  {/* Sök – expanderar på hover/focus och skickar query som ?q=... */}
                  {showSearch && (
                    <form
                      onSubmit={handleSearchSubmit}
                      className="group relative hidden h-9 items-center md:flex"
                    >
                      <div className="flex h-9 items-center gap-2 rounded-full border border-border pl-2 pr-0.5 text-muted-foreground backdrop-blur-md transition-all duration-200 ease-out hover:border-ring/50 group-focus-within:border-ring/50">
                        <svg
                          className="h-4 w-4 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                          placeholder={searchPlaceholder}
                          className="w-0 bg-transparent text-[13px] font-medium text-foreground placeholder:text-muted-foreground opacity-0 outline-none transition-all duration-200 ease-out group-hover:w-48 group-hover:opacity-100 group-focus-within:w-48 group-focus-within:opacity-100"
                        />
                      </div>
                    </form>
                  )}

                  {/* Upgrade / Share – stil enligt referens, funktion kan kopplas senare */}
                  {shouldShowPrimaryAction && primaryAction && (
                    <button
                      type="button"
                      onClick={() => router.push(primaryAction.href)}
                      className="hidden h-9 items-center rounded-full border border-border px-5 text-[13px] font-medium text-foreground transition-all md:inline-flex"
                    >
                      {primaryAction.label}
                    </button>
                  )}

                  <NotificationBell />

                  {showProfileMenu && (
                    <UserMenu user={user} onSignOut={handleSignOut} currentRole={displayRoleForMenu} originalRole={originalRole} />
                  )}
                </>
              ) : (
                <>
                  {/* Sign in / Sign up – endast desktop; på mobil finns de i mobilmenyn och i hero */}
                  {!user && (
                    <div className="hidden items-center gap-3 lg:flex">
                      {isPublicPage && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                      {isauthorRoute && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/author/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/author/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                      {isReaderRoute && (
                        <>
                          <Link
                            href={secondaryAction?.href ?? "/reader/signin"}
                            className="btn-secondary"
                          >
                            {secondaryAction?.label ?? "Sign in"}
                          </Link>
                          <Link
                            href={primaryAction?.href ?? "/reader/signup"}
                            className="btn-primary"
                          >
                            {primaryAction?.label ?? "Sign up"}
                          </Link>
                        </>
                      )}
                    </div>
                  )}


                </>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* Mobilmeny – fullskärm med länkar + Sign in / Sign up */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} className="ui-nav-drawer" aria-label="Navigation" id="verkli-mobile-navigation">
        <div className="ui-nav-drawer-head">
          <span className="font-display text-xl">Explore Verkli</span>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="ui-icon-control" aria-label="Close menu"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="ui-nav-drawer-links">
          {(isauthorRoute ? authorNavItems : isReaderRoute ? readerNavItems : publicNavItems).map((item) => (
            <div key={item.label} className="ui-nav-mobile-group">
              <Link href={item.href} onClick={() => setMobileMenuOpen(false)} className="ui-nav-mobile-link">
                {item.label}<ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              {item.children?.filter((child) => child.href !== item.href).map((child) => (
                <Link key={child.href} href={child.href} onClick={() => setMobileMenuOpen(false)} className="ui-nav-mobile-child">
                  {child.label}<ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ))}
          {(isauthorRoute || (!isReaderRoute && publicNavItems.some((item) => item.label === "Product"))) && <Link href="/author#studio" onClick={() => setMobileMenuOpen(false)} className="ui-nav-studio"><Play size={18} aria-hidden="true" /><span>Step inside the studio<small>Write. Translate. Listen. Publish.</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link>}
        </div>
        {!user && <div className="ui-nav-drawer-actions">
          <Link href={primaryAction?.href ?? (isauthorRoute ? "/author/signup" : isReaderRoute ? "/reader/signup" : "/signup")} onClick={() => setMobileMenuOpen(false)} className="btn-primary w-full">{primaryAction?.label ?? "Sign up"}</Link>
          <Link href={secondaryAction?.href ?? (isauthorRoute ? "/author/signin" : isReaderRoute ? "/reader/signin" : "/signin")} onClick={() => setMobileMenuOpen(false)} className="btn-secondary w-full">{secondaryAction?.label ?? "Sign in"}</Link>
        </div>}
      </Dialog>
    </header>
      </div>
      {/* Spacer i flödet så innehåll börjar under fixed navbar; scrollar bort medan navbaren ligger kvar högst upp */}
      <div className="h-[88px] flex-shrink-0" aria-hidden />
      {/* Portal: dropdown utanför navbar DOM så ingen stacking/overflow klipper; z 100 ovanför allt */}
      {typeof document !== "undefined" &&
        dropdownOpen &&
        createPortal(
          (() => {
            const navItems = isauthorRoute ? authorNavItems : isReaderRoute ? readerNavItems : publicNavItems;
            const openItem = navItems.find((i) => i.label === dropdownOpen!.key);
            const childCount = openItem?.children?.length ?? 0;
            const columnCount = childCount > 4 ? 2 : 1;
            const width = childCount > 0 ? (columnCount === 1 ? 440 : 560) : 720;
            const left = typeof window !== "undefined"
              ? Math.max(12, Math.min(dropdownOpen!.left, window.innerWidth - width - 12))
              : dropdownOpen!.left;
            const containerClass = childCount > 0
              ? (columnCount === 1
                  ? "w-[min(440px,calc(100vw-2rem))]"
                  : "w-[min(560px,calc(100vw-2rem))]")
              : "w-[min(720px,calc(100vw-2.5rem))]";

            return (
              <div
                ref={dropdownPanelRef}
                id="verkli-nav-panel"
                role="region"
                aria-label={`${dropdownOpen.key} navigation`}
                data-keyboard={dropdownOpen.keyboard || undefined}
                className="ui-nav-popover"
                style={{
                  position: "fixed",
                  top: dropdownOpen!.top,
                  left,
                  zIndex: 10000,
                }}
                onPointerEnter={clearDropdownTimers}
                onPointerLeave={leaveDropdown}
              >
                <div
                  className={`ui-popover-surface ${containerClass} max-h-[min(calc(100dvh-120px),36rem)] overflow-y-auto overscroll-contain p-2`}
                >
                  {(() => {
                    if (openItem?.children?.length) {
                      const header = dropdownHeaderMeta[openItem.label];
                      const itemMeta = dropdownItemMeta[openItem.label] ?? {};
                      const resolvedChildren =
                        isReaderRoute && openItem.label === "Library"
                          ? [
                              { label: "Currently reading", href: "/reader/library?tab=reading" },
                              { label: "Bookmarks", href: "/reader/library?tab=saved" },
                              { label: "Finished", href: "/reader/library?tab=finished" },
                            ]
                          : openItem.children;
                      return (
                        <div>
                          {header && (
                            <div className="ui-nav-panel-heading">
                              <p className="font-display text-[22px] leading-tight tracking-tight text-foreground">
                                {header.title}
                              </p>
                              {header.description && (
                                <p className="text-[13px] text-muted-foreground ">
                                  {header.description}
                                </p>
                              )}
                            </div>
                          )}
                          <div className={columnCount === 1 ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
                            {resolvedChildren.map((child, idx) => {
                              const meta = itemMeta[child.label];
                              return (
                                <Link
                                  key={idx}
                                  href={child.href}
                                  onClick={closeDropdown}
                                  className="ui-nav-destination"
                                >
                                  <div className="ui-nav-destination-icon">
                                    {meta?.icon ?? (
                                      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[14px] font-medium text-foreground">
                                      {child.label}
                                    </p>
                                    {meta?.description && (
                                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                                        {meta.description}
                                      </p>
                                    )}
                                  </div>
                                  <ArrowUpRight className="ui-nav-destination-arrow" size={16} aria-hidden="true" />
                                </Link>
                              );
                            })}
                          </div>
                          {openItem.label === "Product" && <Link href="/author#studio" onClick={closeDropdown} className="ui-nav-studio"><Play size={18} aria-hidden="true" /><span>Step inside the studio<small>Write. Translate. Listen. Publish.</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link>}
                        </div>
                      );
                    }
                    const legacy = dropdownContent[dropdownOpen!.key as keyof typeof dropdownContent];
                    if (legacy) {
                      return (
                        <>
                          <div className="mb-4 border-b border-border pb-3 ">
                            <h3 className="text-[17px] font-semibold leading-tight text-foreground ">
                              {legacy.title}
                            </h3>
                            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground ">
                              {legacy.description}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {legacy.items.map((menuItem, idx) => (
                              <div
                                key={idx}
                                className="group/item cursor-pointer rounded-2xl border border-transparent px-4 py-3 transition-all duration-150 hover:border-border hover:bg-accent/50 "
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent ring-1 ring-black/5 dark:ring-white/10">
                                    <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-[14px] font-semibold leading-tight text-foreground transition-colors group-hover/item:text-accent-foreground">
                                      {menuItem.title}
                                    </h4>
                                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground ">
                                      {menuItem.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </>
  );
}
