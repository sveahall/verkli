"use client";

import { useState } from "react";
import { useNotificationList } from "@/hooks/useNotifications";
import NotificationItem from "@/components/notifications/NotificationItem";
import PageHeader from "@/components/reader/PageHeader";
import EmptyState from "@/components/reader/EmptyState";
import { Bell } from "lucide-react";

export default function ReaderNotificationsPage() {
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Your reading space"
        title="Notifications"
        description="Updates from your books, authors and conversations."
        actions={
        <button
          type="button"
          onClick={handleMarkAllRead}
          className="btn-secondary text-[13px]"
        >
          Mark all as read
        </button>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-[#907AFF]" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" aria-hidden />}
            title="You're all caught up"
            description="New updates will appear here. Return to your library whenever you’re ready to read."
          />
        ) : (
          <div className="divide-y divide-border">
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
            className="btn-secondary text-[13px]"
          >
            Previous
          </button>
          <span className="text-[13px] text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary text-[13px]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
