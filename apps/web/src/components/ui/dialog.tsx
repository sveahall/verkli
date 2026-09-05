"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type DialogProps = Pick<React.DialogHTMLAttributes<HTMLDialogElement>, "aria-labelledby" | "aria-describedby"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

export function Dialog({ open, onOpenChange, children, className, ...accessibilityProps }: DialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // Close while the element is still connected so the browser can restore
    // its recorded opener when an owner conditionally unmounts the dialog.
    return () => { if (dialog?.open) dialog.close(); };
  }, [mounted]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
    // `mounted` is a dependency, not just a guard: until it flips true this
    // component renders null, so dialogRef.current is null and the effect bails
    // early. Without it here the effect never re-runs and a dialog mounted with
    // open={true} never calls showModal().
  }, [open, mounted]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
      onOpenChange(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    // Native modality keeps the page inert, but Tab can still enter browser
    // chrome. Wrap only the local boundaries so focus stays in this dialog.
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex], [contenteditable='true']"
    )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <dialog
      {...accessibilityProps}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => { if (open) onOpenChange(false); }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "dialog-backdrop fixed inset-0 m-auto w-[min(92vw,520px)] rounded-2xl border border-slate-200/80 bg-white p-0 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.18)] focus:outline-none dark:border-white/10 dark:bg-[#0b0b12] dark:text-white",
        className
      )}
    >
      {children}
    </dialog>,
    document.body
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pt-6", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-[18px] font-semibold", className)} {...props} />
  );
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-2 text-[14px] text-slate-600 dark:text-white/60", className)} {...props} />
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 px-6 pb-6", className)} {...props} />;
}
