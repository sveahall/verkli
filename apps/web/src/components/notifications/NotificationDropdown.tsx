"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
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
  onClose: () => void;
  onCountChange: () => void;
};

export default function NotificationDropdown({ onClose, onCountChange }: NotificationDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    onCountChange();
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onCountChange();
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-white/10">
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
          Notifikationer
        </h3>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="text-[12px] font-medium text-[#907AFF] hover:text-[#7058DD] transition-colors"
        >
          Markera alla som lästa
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#907AFF]" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400 dark:text-white/40">
            Inga notifikationer ännu
          </p>
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

      <div className="border-t border-slate-200/80 px-4 py-2.5 dark:border-white/10">
        <Link
          href="/reader/notifications"
          onClick={onClose}
          className="block text-center text-[13px] font-medium text-[#907AFF] hover:text-[#7058DD] transition-colors"
        >
          Visa alla notifikationer
        </Link>
      </div>
    </div>
  );
}
