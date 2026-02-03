"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteBookButtonProps = {
  bookId: string;
  bookTitle?: string | null;
  redirectTo?: string;
  onDeleted?: () => void;
  label?: string;
  className?: string;
};

export default function DeleteBookButton({
  bookId,
  bookTitle,
  redirectTo,
  onDeleted,
  label = "Delete book",
  className,
}: DeleteBookButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? "Failed to delete book.");
        return;
      }
      setOpen(false);
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete book.";
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isDeleting}
        className={
          className ??
          "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
        }
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#0a0a0f]">
            <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Delete book</h3>
              <p className="mt-1 text-[14px] text-slate-600 dark:text-white/60">
                Vill du verkligen radera denna bok?
              </p>
              {bookTitle && (
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/40">
                  {bookTitle}
                </p>
              )}
            </div>

            {error && (
              <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
