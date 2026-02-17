"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

  const BookmarkIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4 shrink-0" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 4.75h10a2 2 0 0 1 2 2V19l-7-3-7 3V6.75a2 2 0 0 1 2-2Z" />
    </svg>
  );

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={toggle}
      isLoading={loading}
      loadingText="Updating"
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      {BookmarkIcon}
      {bookmarked ? "Bookmarked" : "Bookmark"}
    </Button>
  );
}
