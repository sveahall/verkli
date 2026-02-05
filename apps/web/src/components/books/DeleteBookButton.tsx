"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToastHelpers } from "@/components/ui/Toast";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

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
  const toast = useToastHelpers();
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
      toast.success(bookTitle ? `"${bookTitle}" deleted successfully` : "Book deleted successfully");
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
        title="Delete book"
        className={
          className ??
          "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
        }
      >
        {label || <TrashIcon className="h-4 w-4" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#0a0a0f]">
            <div className="border-b border-black/10 px-5 py-4 dark:border-white/10">
              <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white">Delete book</h3>
              {bookTitle && (
                <p className="mt-2 text-[15px] font-medium text-slate-800 dark:text-white/90">
                  &ldquo;{bookTitle}&rdquo;
                </p>
              )}
              <p className="mt-2 text-[14px] text-slate-600 dark:text-white/60">
                Are you sure you want to delete this book? This will permanently remove all chapters, translations, and associated data.
              </p>
              <p className="mt-1.5 text-[13px] text-red-600 dark:text-red-400">
                This action cannot be undone.
              </p>
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
