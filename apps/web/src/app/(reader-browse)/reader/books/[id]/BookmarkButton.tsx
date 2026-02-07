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
      {bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
    </Button>
  );
}
