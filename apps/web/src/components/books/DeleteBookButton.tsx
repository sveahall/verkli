"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";

type DeleteBookButtonProps = {
  bookId: string;
  bookTitle?: string | null;
  redirectTo?: string;
  onDeleted?: () => void;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "icon";
};

export default function DeleteBookButton({
  bookId,
  bookTitle,
  redirectTo,
  onDeleted,
  label = "Delete book",
  className,
  size = "md",
}: DeleteBookButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    description?: string;
    variant?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.error ?? "Failed to delete book.");
        setToast({ title: "Delete failed", description: data?.error ?? "Try again.", variant: "error" });
        return;
      }
      setOpen(false);
      onDeleted?.();
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        setToast({ title: "Book deleted", variant: "success" });
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete book.";
      setError(msg);
      setToast({ title: "Delete failed", description: msg, variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {toast && (
        <div className="fixed right-6 top-6 z-[1100]">
          <Toast
            title={toast.title}
            description={toast.description}
            variant={toast.variant === "error" ? "error" : "success"}
          />
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={isDeleting}
        size={size}
        className={className}
      >
        {label}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
        title="Vill du verkligen radera denna bok?"
        description={
          <div className="space-y-2">
            <p>Detta går inte att ångra.</p>
            {bookTitle ? (
              <p className="text-[13px] text-slate-500 dark:text-white/50">{bookTitle}</p>
            ) : null}
            {error ? (
              <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
            ) : null}
          </div>
        }
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
