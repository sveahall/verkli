"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
  currentRole?: 'writer' | 'reader';
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
export default function UserMenu({ user, onSignOut, currentRole = 'writer' }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clickedInsideRef = useRef(false);

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  // Handle click outside to close menu
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // If we clicked inside, don't close
      if (clickedInsideRef.current) {
        clickedInsideRef.current = false;
        return;
      }

      const target = event.target as Node;
      // Don't close if clicking inside the menu
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    // Use mousedown instead of click to avoid closing before onClick handlers run
    // Add a small delay to ensure onClick handlers execute first
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSwitchRole = async () => {
    clickedInsideRef.current = true;
    setIsOpen(false);

    // Execute action after a tiny delay to ensure menu closes
    setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        if (currentUser) {
          // Upsert role in profiles table (creates if doesn't exist, updates if exists)
          const { error: updateError } = await supabase
            .from('profiles')
            .upsert(
              {
                user_id: currentUser.id,
                role: currentRole === 'writer' ? 'reader' : 'writer'
              },
              { onConflict: 'user_id' }
            );

          if (updateError) {
            console.error('Error updating role:', {
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              code: updateError.code
            });
          }
        }

        // Refresh router to clear cache and redirect
        router.refresh();
        router.push(currentRole === 'writer' ? '/reader' : '/writer');
      } catch (error) {
        console.error('Error switching role:', error);
        // Still redirect even if update fails
        router.push(currentRole === 'writer' ? '/reader' : '/writer');
      }
    }, 10);
  };

  const handleSignOut = async () => {
    clickedInsideRef.current = true;
    setIsOpen(false);

    // Execute action after a tiny delay to ensure menu closes
    setTimeout(async () => {
      try {
        await onSignOut();
        // Refresh router to clear server cache
        router.refresh();
        // Redirect to landing page
        router.push('/');
      } catch (error) {
        console.error("Error signing out:", error);
      }
    }, 10);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex h-[75px] w-[75px] items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 backdrop-blur-xl transition-all hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        aria-label="Account menu"
        aria-expanded={isOpen}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#907AFF] to-[#E29ED5] text-[18px] font-semibold text-white shadow-lg">
          {displayName.charAt(0).toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-3 z-[1000] w-[280px] overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white/98 dark:bg-[#0a0a0f]/98 p-1 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with user info */}
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/[0.06]">
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
                clickedInsideRef.current = true;
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
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
                clickedInsideRef.current = true;
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
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
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/80 transition-all hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white"
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
          <div className="border-t border-black/5 dark:border-white/[0.06] my-1" />

          {/* Destructive action */}
          <div className="py-1.5">
            <button
              onClick={handleSignOut}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium text-red-600 dark:text-red-400/90 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-400"
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
        </div>
      )}
    </div>
  );
}
