"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveErrorMessage } from "@/lib/error-messages";
import { useToastHelpers } from "@/components/ui/toast";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

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
        setError(resolveErrorMessage(data?.error));
        return;
      }
      setOpen(false);
      toast.success(bookTitle ? `"${bookTitle}" was deleted` : "Book deleted");
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not delete book.";
      setError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          // DeleteBookButton is frequently nested inside <Link>. Without
          // stopping propagation the row navigates to the editor as the
          // dialog tries to open.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        disabled={isDeleting}
        title="Delete book"
        className={
          className ??
          "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
        }
      >
        {label || <TrashIcon className="h-4 w-4" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>Delete book</DialogTitle>
          <DialogDescription>
            {bookTitle && (
              <span className="mb-2 block text-[15px] font-medium text-slate-800 dark:text-white/90">
                &ldquo;{bookTitle}&rdquo;
              </span>
            )}
            Are you sure you want to delete this book? All chapters, translations, and related data will be permanently removed.
            <span className="mt-1.5 block text-[13px] text-red-600 dark:text-red-400">
              This action cannot be undone.
            </span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <DialogBody>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          </DialogBody>
        )}

        <DialogFooter>
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
        </DialogFooter>
      </Dialog>
    </>
  );
}
