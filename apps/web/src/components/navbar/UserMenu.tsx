"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const USER_MENU_WIDTH = 280;

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
  currentRole?: "writer" | "reader";
}

/**
 * Global UserMenu component for navbar dropdown
 * 
 * Placerad i components/navbar/ för att:
 * - Vara återanvändbar på alla sidor (writer, reader, public)
 * - Hålla all dropdown state och event handling lokalt
 * - Undvika duplicerad kod mellan sidor
 * - Centralisera design och funktionalitet
 */
export default function UserMenu({ user, onSignOut, currentRole = "writer" }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  // Position för profil-dropdown: mät när den öppnas så vi kan rendera i portal med fixed (ovanför allt, som nav-dropdowns)
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 8, left: rect.right - USER_MENU_WIDTH });
    return () => setMenuPosition(null);
  }, [isOpen]);

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  // Handle click outside to close menu
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking on trigger or inside the menu panel
      if (triggerRef.current?.contains(target) || menuPanelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    // Use mousedown instead of click to avoid closing before onClick handlers run
    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeoutId = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const handleSwitchRole = async () => {
    setIsOpen(false);

    const supabase = createClient();
    const nextRole = currentRole === "writer" ? "reader" : "writer";

    try {
      // Update role in profiles table (creates if doesn't exist, updates if exists)
      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            role: nextRole,
          },
          { onConflict: "user_id" }
        );

      if (updateError) {
        console.error("Error updating role:", {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        setToastMessage("Could not switch role. Try again.");
        return;
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          role: nextRole,
        },
      });
      if (metadataError) {
        console.warn("Could not update auth metadata role:", metadataError);
      }

      try {
        await supabase.from("users").update({ role: nextRole }).eq("id", user.id);
      } catch (error) {
        console.warn("Could not update users table role:", error);
      }

      // Refresh router to clear cache and redirect
      router.refresh();
      router.push(currentRole === "writer" ? "/reader" : "/writer");
    } catch (error) {
      console.error("Error switching role:", error);
      setToastMessage("Could not switch role. Try again.");
    }
  };

  const handleSignOut = async () => {
    setIsOpen(false);

    try {
      await onSignOut();
      // Refresh router to clear server cache
      router.refresh();
      // Redirect to landing page
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="relative">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-6 z-[1100] rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white dark:bg-white dark:text-slate-900"
        >
          {toastMessage}
        </div>
      )}
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="touch-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-transparent text-slate-700 transition-all hover:bg-slate-100 dark:border-white/[0.4] dark:text-white dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 focus:ring-offset-background"
        aria-label="Account menu"
        aria-expanded={isOpen}
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
            className="w-[min(280px,calc(100vw-2rem))] max-w-[280px] overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white/[0.98] dark:bg-[#0a0a0f]/[0.98] p-1 backdrop-blur-xl"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 10000,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header with user info */}
          <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.06]">
            <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {displayName}
            </p>
            <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50 truncate">
              {user?.email}
            </p>
          </div>

          {/* Primary actions */}
          <div className="py-1.5">
            <Link
              href={currentRole === 'writer' ? "/writer/profile" : "/reader/profile"}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
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
              href={currentRole === 'writer' ? "/writer/settings" : "/reader/settings"}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
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

            <button
              onClick={handleSwitchRole}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#907AFF]/30"
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
              <span>Switch to {currentRole === 'writer' ? 'Reader' : 'Writer'}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="my-1 border-t border-black/[0.05] dark:border-white/[0.06]" />

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
