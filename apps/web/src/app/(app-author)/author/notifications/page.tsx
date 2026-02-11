"use client";

import { useState } from "react";
import { useNotificationList } from "@/hooks/useNotifications";
import NotificationItem from "@/components/notifications/NotificationItem";

export default function AuthorNotificationsPage() {
  const [page, setPage] = useState(1);
  const { notifications, total, loading, refetch } = useNotificationList(page);
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    refetch();
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    refetch();
  };

  return (
    <div className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Notifikationer
        </h1>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="text-[13px] font-medium text-[#907AFF] hover:text-[#7058DD] transition-colors"
        >
          Markera alla som lästa
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#907AFF]" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-slate-400 dark:text-white/40">
            Inga notifikationer ännu
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {notifications.map((n) => (
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
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/10"
          >
            Föregående
          </button>
          <span className="text-[13px] text-slate-500 dark:text-white/50">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/10"
          >
            Nästa
          </button>
        </div>
      )}
    </div>
  );
}
