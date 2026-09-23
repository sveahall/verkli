"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";

export default function PublicAuthorError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // console.error alone means the crash exists only in the viewer's own
    // devtools. Sentry.captureException is a no-op until a DSN is configured,
    // so this is safe to ship ahead of one — and without it, setting the DSN
    // later would still report nothing from any error boundary.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[65vh] flex-1 flex-col items-center justify-center bg-background px-6 py-20 text-foreground">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred. Please try again."
        action={
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        }
      />
    </main>
  );
}
