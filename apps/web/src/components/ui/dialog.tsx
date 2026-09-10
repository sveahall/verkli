"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const DialogTitleContext = React.createContext<React.Dispatch<React.SetStateAction<string | undefined>> | null>(null);

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export function Dialog({ open, onOpenChange, children, className, ...props }: DialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [titleId, setTitleId] = React.useState<string>();
  const backdropPointerDown = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  const isOutsidePanel = (event: React.MouseEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    );
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (backdropPointerDown.current && isOutsidePanel(event)) onOpenChange(false);
    backdropPointerDown.current = false;
  };

  if (!mounted) return null;

  return createPortal(
    <dialog
      {...props}
      ref={dialogRef}
      aria-labelledby={props["aria-labelledby"] ?? (props["aria-label"] ? undefined : titleId)}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onPointerDown={(event) => { backdropPointerDown.current = isOutsidePanel(event); }}
      onClose={() => { if (open) onOpenChange(false); }}
      onClick={handleBackdropClick}
      className={cn(
        "dialog-backdrop fixed inset-0 m-auto w-[min(92vw,520px)] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-0 text-foreground shadow-surface-lg focus:outline-none",
        className
      )}
    >
      <DialogTitleContext.Provider value={setTitleId}>{children}</DialogTitleContext.Provider>
    </dialog>,
    document.body
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pt-6", className)} {...props} />;
}

export function DialogTitle({ className, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const generatedId = React.useId();
  const titleId = id ?? generatedId;
  const setTitleId = React.useContext(DialogTitleContext);

  React.useEffect(() => {
    setTitleId?.(titleId);
    return () => setTitleId?.(undefined);
  }, [setTitleId, titleId]);

  return (
    <h2 id={titleId} className={cn("font-display text-[22px] font-medium tracking-tight", className)} {...props} />
  );
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-2 text-[14px] text-muted-foreground", className)} {...props} />
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 px-6 pb-6", className)} {...props} />;
}
