"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BookmarkRemoveButtonProps = {
  bookId: string;
};

export default function BookmarkRemoveButton({ bookId }: BookmarkRemoveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const remove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={loading}
      className="text-[12px] font-medium text-slate-400 hover:text-slate-600 disabled:opacity-60 dark:text-white/40 dark:hover:text-white/60"
    >
      Ta bort
    </button>
  );
}
