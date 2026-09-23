"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import Link from "next/link";
import { Bell, ArrowUpRight, X } from "lucide-react";
import NotificationItem from "./NotificationItem";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

type NotificationDropdownProps = {
  id?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  keyboardOpen?: boolean;
  allHref?: string;
  onClose: () => void;
  onCountChange: () => void;
  /** When set, dropdown is positioned fixed under the anchor (for portal rendering). */
  anchorRect?: DOMRect;
};

export default function NotificationDropdown({ id, triggerRef, keyboardOpen, allHref = "/reader/notifications", onClose, onCountChange, anchorRect }: NotificationDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setNotifications(json.notifications ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const panel = ref.current;
    const trigger = triggerRef?.current;
    if (keyboardOpen) panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const contains = (target: EventTarget | null) => target instanceof Node &&
      (panel?.contains(target) || trigger?.contains(target));
    const handleOutside = (event: Event) => { if (!contains(event.target)) onClose(); };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); trigger?.focus(); return; }
      const controls = Array.from(panel?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)") ?? []);
      if (event.target === trigger && (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey))) {
        event.preventDefault(); controls[0]?.focus();
      } else if (event.key === "Tab" && panel?.contains(event.target as Node)) {
        const first = document.activeElement === controls[0];
        const last = document.activeElement === controls[controls.length - 1];
        if ((event.shiftKey && first) || (!event.shiftKey && last)) {
          event.preventDefault(); onClose();
          const pageControls = Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea"))
            .filter((node) => node.getClientRects().length && !node.hasAttribute("disabled") && !panel?.contains(node));
          const next = trigger ? pageControls[pageControls.indexOf(trigger) + 1] : null;
          (event.shiftKey ? trigger : next ?? trigger)?.focus();
        }
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, triggerRef, keyboardOpen]);

  const handleMarkRead = async (id: string) => {
    if (saving) return;
    setActionError("");
    setSaving(true);
    const prev = notifications;
    setNotifications((cur) =>
      cur.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("mark-read failed");
      onCountChange();
    } catch {
      // Revert optimistic update on failure
      setNotifications(prev);
      setActionError("Could not update notifications. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (saving) return;
    setActionError("");
    setSaving(true);
    const prev = notifications;
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })));

    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error("mark-all-read failed");
      onCountChange();
    } catch {
      // Revert optimistic update on failure
      setNotifications(prev);
      setActionError("Could not update notifications. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isPortal = anchorRect != null;
  const style = isPortal
    ? {
        position: "fixed" as const,
        top: anchorRect.bottom + 8,
        right: Math.max(16, Math.min(window.innerWidth - anchorRect.right, window.innerWidth - Math.min(360, window.innerWidth - 32) - 16)),
        maxHeight: Math.max(100, window.innerHeight - anchorRect.bottom - 24),
        zIndex: 10002,
      }
    : undefined;
  const className =
    "ui-popover-surface flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overscroll-contain " +
    (isPortal ? "" : " absolute right-0 top-full z-[10002] mt-2");

  return (
    <div id={id} ref={ref} role="region" aria-label="Notifications" className={className} style={style}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h3 className="font-display text-[20px] font-medium tracking-tight text-foreground">Notifications</h3>
        <button type="button" className="ui-icon-control" aria-label="Close notifications" onClick={() => { onClose(); triggerRef?.current?.focus(); }}><X size={18} aria-hidden="true" /></button>
      </div>
      {actionError && <p role="alert" className="px-5 pt-4 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <div role="status" aria-label="Loading notifications" className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[#907AFF]" />
          </div>
        ) : loadError ? (
          <div className="px-5 py-8"><p role="alert" className="text-sm text-foreground">Could not load notifications.</p><p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p><button type="button" className="btn-secondary mt-5" onClick={fetchNotifications}>Try again</button></div>
        ) : notifications.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-5 py-10 text-center"><Bell size={25} className="text-accent-foreground" aria-hidden="true" /><p className="text-sm font-medium text-foreground">No notifications yet</p><p className="max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">Updates from your stories and community will appear here.</p></div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              id={n.id}
              type={n.type}
              title={n.title}
              body={n.body}
              read={n.read}
              createdAt={n.created_at}
              entityType={n.entity_type}
              entityId={n.entity_id}
              onMarkRead={handleMarkRead}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <Link href={allHref} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">View all<ArrowUpRight size={14} aria-hidden="true" /></Link>
        <button type="button" onClick={handleMarkAllRead} disabled={saving || loading || loadError || !notifications.some((item) => !item.read)} className="min-h-11 rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring">{saving ? "Updating…" : "Mark all as read"}</button>
      </div>
    </div>
  );
}
