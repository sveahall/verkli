"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Context
 * ───────────────────────────────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Icons
 * ───────────────────────────────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Toast Item Component
 * ───────────────────────────────────────────────────────────────────────────── */

const variantStyles: Record<ToastVariant, { container: string; icon: string }> = {
  success: {
    container: "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800",
    icon: "text-emerald-500 dark:text-emerald-400",
  },
  error: {
    container: "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800",
    icon: "text-red-500 dark:text-red-400",
  },
  info: {
    container: "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
    icon: "text-blue-500 dark:text-blue-400",
  },
  warning: {
    container: "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800",
    icon: "text-amber-500 dark:text-amber-400",
  },
};

const variantIcons: Record<ToastVariant, typeof CheckIcon> = {
  success: CheckIcon,
  error: ErrorIcon,
  info: InfoIcon,
  warning: WarningIcon,
};

interface ToastItemProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastItemComponent({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 150);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(handleDismiss, toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.duration, handleDismiss]);

  const styles = variantStyles[toast.variant];
  const Icon = variantIcons[toast.variant];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border
        px-4 py-3 shadow-lg backdrop-blur-sm
        transition-all duration-150 ease-out
        ${styles.container}
        ${isExiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"}
      `}
    >
      <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${styles.icon}`} />
      <p className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        aria-label="Dismiss"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Toast Container
 * ───────────────────────────────────────────────────────────────────────────── */

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-end justify-start gap-3 p-4 sm:p-6"
    >
      {toasts.map((t) => (
        <ToastItemComponent key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Provider
 * ───────────────────────────────────────────────────────────────────────────── */

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;

let toastIdCounter = 0;
function generateId() {
  return `toast-${++toastIdCounter}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    const newToast: ToastItem = {
      id: generateId(),
      message,
      variant: options?.variant ?? "info",
      duration: options?.duration ?? DEFAULT_DURATION,
    };

    setToasts((prev) => {
      const updated = [...prev, newToast];
      // Keep only the most recent toasts
      return updated.slice(-MAX_TOASTS);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, dismissAll }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Convenience helpers
 * ───────────────────────────────────────────────────────────────────────────── */

export function useToastHelpers() {
  const { toast } = useToast();

  return {
    success: (message: string, duration?: number) =>
      toast(message, { variant: "success", duration }),
    error: (message: string, duration?: number) =>
      toast(message, { variant: "error", duration }),
    info: (message: string, duration?: number) =>
      toast(message, { variant: "info", duration }),
    warning: (message: string, duration?: number) =>
      toast(message, { variant: "warning", duration }),
  };
}
