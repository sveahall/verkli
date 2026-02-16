"use client";

import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useUnreadCount } from "@/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell() {
  const { count, refetch } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCountChange = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="relative" ref={buttonRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
        aria-label="Notifikationer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" && buttonRef.current &&
        createPortal(
          <NotificationDropdown onClose={handleClose} onCountChange={handleCountChange} anchorRect={buttonRef.current.getBoundingClientRect()} />,
          document.body
        )}
    </div>
  );
}
