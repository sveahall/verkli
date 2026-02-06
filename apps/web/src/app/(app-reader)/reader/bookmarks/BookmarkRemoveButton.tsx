"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToastHelpers } from "@/components/ui/Toast";

type BookmarkRemoveButtonProps = {
  bookId: string;
  bookTitle?: string;
};

export default function BookmarkRemoveButton({ bookId, bookTitle }: BookmarkRemoveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const toast = useToastHelpers();

  const remove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(bookTitle ? `Removed "${bookTitle}" from bookmarks` : "Removed from bookmarks");
        router.refresh();
      } else {
        toast.error("Could not remove bookmark. Please try again.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[12px] text-slate-500 dark:text-white/50">Remove?</span>
        <button
          type="button"
          onClick={remove}
          disabled={loading}
          className="text-[12px] font-medium text-red-600 hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
        >
          {loading ? "Removing..." : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={loading}
          className="text-[12px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60 dark:text-white/50 dark:hover:text-white/70"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      disabled={loading}
      className="text-[12px] font-medium text-slate-400 hover:text-slate-600 disabled:opacity-60 dark:text-white/40 dark:hover:text-white/60"
    >
      Remove
    </button>
  );
}
