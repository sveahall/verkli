"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ToastProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  variant?: "success" | "error" | "info";
  action?: React.ReactNode;
};

const toastVariants: Record<NonNullable<ToastProps["variant"]>, string> = {
  success: "border-emerald-200/80 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  error: "border-red-200/80 bg-red-50/80 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100",
  info: "border-slate-200/80 bg-white text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white",
};

export function Toast({
  title,
  description,
  variant = "info",
  action,
  className,
  ...props
}: ToastProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(
        "flex w-full max-w-md items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-[14px] shadow-[0_12px_30px_rgba(15,23,42,0.1)]",
        toastVariants[variant],
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {title && <div className="text-[14px] font-semibold">{title}</div>}
        {description && <p className="text-[13px] opacity-80">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

// ─── Toast context and provider for imperative toasts ────────────────────────

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: "success" | "error" | "info";
};

type ToastContextValue = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const addToast = React.useCallback(
    (variant: "success" | "error" | "info") =>
      (title: string, description?: string) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, title, description, variant }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, TOAST_DURATION_MS);
      },
    []
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      success: addToast("success"),
      error: addToast("error"),
      info: addToast("info"),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <Toast
            key={t.id}
            variant={t.variant}
            title={t.title}
            description={t.description}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastHelpers(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToastHelpers must be used within a ToastProvider");
  }
  return ctx;
}
