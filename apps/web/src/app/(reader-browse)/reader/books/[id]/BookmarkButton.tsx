"use client";

import { useState } from "react";

type BookmarkButtonProps = {
  bookId: string;
  initialBookmarked: boolean;
};

export default function BookmarkButton({ bookId, initialBookmarked }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      if (bookmarked) {
        const res = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`, {
          method: "DELETE",
        });
        if (res.ok) setBookmarked(false);
      } else {
        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId }),
        });
        if (res.ok) setBookmarked(true);
      }
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
      aria-label={bookmarked ? "Ta bort bokmärke" : "Lägg till bokmärke"}
    >
      {bookmarked ? "★ Bokmärkt" : "☆ Bokmärk"}
    </button>
  );
}
