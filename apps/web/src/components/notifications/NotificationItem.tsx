"use client";

type NotificationItemProps = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  onMarkRead: (id: string) => void;
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TypeIcon({ type }: { type: string }) {
  if (type === "new_follower") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  }
  if (type === "comment_reply") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
      </svg>
    );
  }
  if (type === "new_review") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l3 6 6.5 1-4.8 4.6 1.2 6.4-5.9-3.2-5.9 3.2 1.2-6.4L2.5 10.5 9 9.5 12 3.5z" />
      </svg>
    );
  }
  // Default bell icon
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function getNotificationHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "user") return `/reader/profile/${entityId}`;
  if (entityType === "book") return `/reader/books/${entityId}`;
  if (entityType === "comment") return null;
  return null;
}

export default function NotificationItem({
  id,
  type,
  title,
  body,
  read,
  createdAt,
  entityType,
  entityId,
  onMarkRead,
}: NotificationItemProps) {
  const href = getNotificationHref(entityType, entityId);

  const handleClick = () => {
    if (!read) {
      onMarkRead(id);
    }
    if (href) {
      window.location.href = href;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/5 ${
        !read ? "bg-slate-50 dark:bg-white/5" : ""
      }`}
    >
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#907AFF]/10 text-[#907AFF]">
        <TypeIcon type={type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-900 dark:text-white">{title}</p>
        {body && (
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/50 line-clamp-2">{body}</p>
        )}
        <p className="mt-1 text-[11px] text-slate-400 dark:text-white/30">{relativeTime(createdAt)}</p>
      </div>
      {!read && (
        <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-[#907AFF]" />
      )}
    </button>
  );
}
