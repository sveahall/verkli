"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useToastHelpers } from "@/components/ui/toast";
import { setActiveRoleCookieClient } from "@/lib/active-role";
import { getMarketingEnabled } from "@/lib/flags";

const USER_MENU_WIDTH = 280;

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
  currentRole?: "author" | "reader";
  /** Original signup role - readers can never switch to author */
  originalRole?: "author" | "reader";
}

/**
 * Global UserMenu component for navbar dropdown
 * 
 * Placerad i components/navbar/ för att:
 * - Vara återanvändbar på alla sidor (author, reader, public)
 * - Hålla all dropdown state och event handling lokalt
 * - Undvika duplicerad kod mellan sidor
 * - Centralisera design och funktionalitet
 */
export default function UserMenu({ user, onSignOut, currentRole = "author", originalRole }: UserMenuProps) {
  // SECURITY: Only users whose DB profile role is "author" may switch views.
  // Never rely on currentRole (which defaults to "author" before profile loads).
  const canSwitchRole = originalRole === "author";
  const router = useRouter();
  const toast = useToastHelpers();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const panelId = useId();

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setMenuPosition(null);
  }, []);

  const openMenu = (focus: "first" | "last" | null = null) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(USER_MENU_WIDTH, window.innerWidth - 32);
    setMenuPosition({
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 96)),
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
    });
    focusOnOpen.current = focus;
    setIsOpen(true);
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  useEffect(() => {
    if (!isOpen) return;

    const controls = menuPanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (focusOnOpen.current && controls?.length) {
      controls[focusOnOpen.current === "last" ? controls.length - 1 : 0].focus();
      focusOnOpen.current = null;
    }

    const handleOutside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuPanelRef.current?.contains(target)) closeMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    };
    const handleScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menuPanelRef.current?.contains(event.target)) closeMenu();
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, closeMenu]);

  const handlePanelKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const controls = Array.from(menuPanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    const index = controls.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % controls.length;
    if (event.key === "ArrowUp") nextIndex = (index - 1 + controls.length) % controls.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = controls.length - 1;
    if (nextIndex !== undefined) {
      event.preventDefault();
      controls[nextIndex]?.focus();
    }
    if (event.key === "Tab" && event.shiftKey && index === 0) {
      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    } else if (event.key === "Tab" && !event.shiftKey && index === controls.length - 1) {
      event.preventDefault();
      const pageControls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !menuPanelRef.current?.contains(element) && element.getClientRects().length > 0 && !element.closest("[inert]"));
      const triggerIndex = pageControls.indexOf(triggerRef.current!);
      closeMenu();
      (pageControls[triggerIndex + 1] ?? triggerRef.current)?.focus();
    }
  };

  const handleSwitchRole = async () => {
    closeMenu();

    const nextRole = currentRole === "author" ? "reader" : "author";

    try {
      const response = await fetch("/api/auth/active-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.error("Error updating role:", payload);
        toast.error("Could not switch view. Please try again.");
        return;
      }

      setActiveRoleCookieClient(nextRole);
      router.refresh();
      router.push(currentRole === "author" ? "/reader/home" : "/author/home");
    } catch (error) {
      console.error("Error switching role:", error);
      toast.error("Could not switch role. Please try again.");
    }
  };

  const handleSignOut = async () => {
    closeMenu();

    try {
      await onSignOut();
      // Refresh router to clear server cache
      router.refresh();
      // Route users directly to the sign-in flow they used last.
      router.push(currentRole === "author" ? "/author/signin" : "/reader/signin");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) {
            closeMenu();
            return;
          }
          openMenu(e.detail === 0 ? "first" : null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) openMenu(event.key === "ArrowDown" ? "first" : "last");
            else {
              const controls = menuPanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
              controls?.[event.key === "ArrowDown" ? 0 : controls.length - 1]?.focus();
            }
          } else if (event.key === "Tab" && isOpen) {
            if (event.shiftKey) closeMenu();
            else {
              event.preventDefault();
              menuPanelRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
            }
          }
        }}
        type="button"
        className="flex h-11 min-h-[44px] min-w-[44px] w-11 shrink-0 items-center justify-center rounded-full border border-ring/50 bg-transparent text-foreground transition-all hover:bg-accent focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 focus:ring-offset-background"
        aria-label="Account menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
      >
        <span className="flex h-4 w-4 items-center justify-center">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
            <path d="M4.5 20.4a7.5 7.5 0 0 1 15 0" />
          </svg>
        </span>
      </button>

      {/* Profil-dropdown i portal till body med z 10000 så den syns ovanpå allt (som nav-dropdowns); andra dropdowns påverkas inte */}
      {typeof document !== "undefined" &&
        isOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuPanelRef}
            id={panelId}
            role="region"
            aria-label="Account navigation"
            onKeyDown={handlePanelKeys}
            className="ui-popover-surface w-[min(280px,calc(100vw-2rem))] max-w-[280px] overflow-y-auto overscroll-contain p-1"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              maxHeight: `calc(100dvh - ${menuPosition.top + 12}px)`,
              zIndex: 10000,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header with user info */}
          <div className="px-4 py-3 border-b border-border">
            <p className="truncate text-[15px] font-semibold text-foreground ">
              {displayName}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>

          {/* Primary actions */}
          <div className="py-1.5">
            <Link
              href={currentRole === 'author' ? "/author/profile" : "/reader/profile"}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
            >
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>Profile</span>
            </Link>

            <Link
              href={currentRole === 'author' ? "/author/settings" : "/reader/settings"}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
            >
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>Settings</span>
            </Link>

            {currentRole === "author" && getMarketingEnabled() && (
              <Link
                href="/author/marketing"
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
              >
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 16.5v-9A2.25 2.25 0 016.75 5.25h10.5A2.25 2.25 0 0119.5 7.5v9A2.25 2.25 0 0117.25 18.75H6.75A2.25 2.25 0 014.5 16.5z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h7.5M8.25 13.5h5.25" />
                </svg>
                <span>Marketing</span>
              </Link>
            )}

            {currentRole === "author" && (
              <Link
                href="/account/feedback"
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
              >
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Feedback</span>
              </Link>
            )}

            <Link
              href={currentRole === "author" ? "/author/billing" : "/reader/billing"}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
            >
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8.25h18M6.75 3.75h10.5A2.25 2.25 0 0119.5 6v12a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V6a2.25 2.25 0 012.25-2.25z"
                />
              </svg>
              <span>Billing</span>
            </Link>

            {/* SECURITY: Only show role switch for authors - readers can NEVER access author mode */}
            {canSwitchRole && (
              <button
                onClick={handleSwitchRole}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-foreground transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
              >
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                <span>Switch to {currentRole === "author" ? "Reader" : "Author"}</span>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="my-1 border-t border-border" />

          {/* Destructive action */}
          <div className="py-1.5">
            <button
              onClick={handleSignOut}
              type="button"
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-red-600 dark:text-red-400/90 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30"
            >
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}
