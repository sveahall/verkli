import { cn } from "@/lib/utils";

export type ErrorBannerProps = {
  message: string;
  /** Optional action (e.g., retry button) */
  action?: React.ReactNode;
  /** "error" (red) or "warning" (amber) */
  severity?: "error" | "warning";
  className?: string;
};

/**
 * Inline error/warning banner — use inside forms, panels, and cards.
 * Replaces the 10+ inline `rounded-xl border border-red-200 bg-red-50 px-4 py-3`
 * patterns scattered across the codebase.
 */
export function ErrorBanner({
  message,
  action,
  severity = "error",
  className,
}: ErrorBannerProps) {
  const isWarning = severity === "warning";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        isWarning
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30",
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg
          className={cn(
            "mt-0.5 h-4 w-4 flex-shrink-0",
            isWarning
              ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          {isWarning ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium",
              isWarning
                ? "text-amber-800 dark:text-amber-200"
                : "text-red-800 dark:text-red-200"
            )}
          >
            {message}
          </p>
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}
