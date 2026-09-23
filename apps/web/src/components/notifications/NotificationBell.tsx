"use client";

import { useState, useCallback, useRef, useId } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useUnreadCount } from "@/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell() {
  const { count, refetch } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCountChange = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setKeyboardOpen(event.detail === 0);
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect() ?? null;
      setAnchorRect(rect);
    }
    setOpen((v) => !v);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="ui-icon-control"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
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

      {open && typeof document !== "undefined" && anchorRect &&
        createPortal(
          <NotificationDropdown id={panelId} triggerRef={buttonRef} keyboardOpen={keyboardOpen} allHref={pathname?.startsWith("/author") ? "/author/notifications" : "/reader/notifications"} onClose={handleClose} onCountChange={handleCountChange} anchorRect={anchorRect} />,
          document.body
        )}
    </div>
  );
}
