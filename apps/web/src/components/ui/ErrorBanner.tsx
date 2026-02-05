"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

/* ─────────────────────────────────────────────────────────────────────────────
 * Error Messages
 * ───────────────────────────────────────────────────────────────────────────── */

const ERROR_MESSAGES: Record<string, { title: string; description: string; action?: { label: string; href: string } }> = {
  author_required: {
    title: "Author access required",
    description: "Author features are only available to author accounts. You can continue browsing as a reader.",
    action: {
      label: "Create author account",
      href: "/author/signup",
    },
  },
  session_expired: {
    title: "Session expired",
    description: "Your session has expired. Please sign in again to continue.",
    action: {
      label: "Sign in",
      href: "/author/signin",
    },
  },
  unauthorized: {
    title: "Access denied",
    description: "You don't have permission to access that resource.",
  },
  not_found: {
    title: "Not found",
    description: "The page or resource you're looking for doesn't exist or has been moved.",
  },
  server_error: {
    title: "Something went wrong",
    description: "We encountered an unexpected error. Please try again or contact support if the problem persists.",
  },
};

// Fallback for unknown error codes
const FALLBACK_ERROR = {
  title: "An error occurred",
  description: "Something didn't work as expected. Please try again.",
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Icons
 * ───────────────────────────────────────────────────────────────────────────── */

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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ErrorBanner Component
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ErrorBannerProps {
  /** Optional custom error code to show (overrides URL param) */
  errorCode?: string;
  /** Called when banner is dismissed */
  onDismiss?: () => void;
}

export function ErrorBanner({ errorCode: propErrorCode, onDismiss }: ErrorBannerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isDismissed, setIsDismissed] = useState(false);

  const errorCode = propErrorCode ?? searchParams.get("error");
  // Use specific error config or fallback for unknown codes
  const errorConfig = errorCode
    ? ERROR_MESSAGES[errorCode] ?? { ...FALLBACK_ERROR, title: `Error: ${errorCode}` }
    : null;

  // Clean up URL when banner is shown
  useEffect(() => {
    if (errorCode && searchParams.has("error")) {
      // Remove error param from URL without triggering navigation
      const params = new URLSearchParams(searchParams.toString());
      params.delete("error");
      const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [errorCode, searchParams, pathname, router]);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (!errorConfig || isDismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mx-auto mb-6 w-full max-w-4xl animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/50">
        <InfoIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {errorConfig.title}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {errorConfig.description}
          </p>
          {errorConfig.action && (
            <a
              href={errorConfig.action.href}
              className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {errorConfig.action.label}
              <svg className="ml-1 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Dismiss"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ErrorBannerWrapper - Suspense boundary wrapper
 * ───────────────────────────────────────────────────────────────────────────── */

import { Suspense } from "react";

export function ErrorBannerWrapper(props: ErrorBannerProps) {
  return (
    <Suspense fallback={null}>
      <ErrorBanner {...props} />
    </Suspense>
  );
}
