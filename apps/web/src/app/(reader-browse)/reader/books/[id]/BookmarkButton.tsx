"use client";

import { useState } from "react";
import { useToastHelpers } from "@/components/ui/Toast";

type BookmarkButtonProps = {
  bookId: string;
  initialBookmarked: boolean;
  bookTitle?: string;
};

export default function BookmarkButton({ bookId, initialBookmarked, bookTitle }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);
  const toast = useToastHelpers();

  const toggle = async () => {
    setLoading(true);
    try {
      if (bookmarked) {
        const res = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setBookmarked(false);
          toast.success(bookTitle ? `Removed "${bookTitle}" from bookmarks` : "Removed from bookmarks");
        } else {
          toast.error("Could not remove bookmark. Please try again.");
        }
      } else {
        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId }),
        });
        if (res.ok) {
          setBookmarked(true);
          toast.success(bookTitle ? `Saved "${bookTitle}" to bookmarks` : "Saved to bookmarks");
        } else {
          toast.error("Could not save bookmark. Please try again.");
        }
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {bookmarked ? "Removing..." : "Saving..."}
        </span>
      ) : bookmarked ? (
        "★ Saved"
      ) : (
        "☆ Save"
      )}
    </button>
  );
}
