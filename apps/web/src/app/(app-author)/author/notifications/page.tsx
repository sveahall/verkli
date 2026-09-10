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
        <h1 className="author-page-title text-foreground">
          Notifications
        </h1>
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="text-[13px] font-medium text-accent-foreground hover:text-accent-foreground transition-colors"
        >
          Mark all as read
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm dark:border-border dark:bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-[#907AFF]" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground dark:text-muted-foreground">
            No notifications yet
          </p>
        ) : (
          <div className="divide-y divide-border dark:divide-border">
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
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:text-muted-foreground dark:hover:bg-accent"
          >
            Previous
          </button>
          <span className="text-[13px] text-muted-foreground dark:text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:text-muted-foreground dark:hover:bg-accent"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
