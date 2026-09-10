"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <main className="max-w-md px-6 py-20 text-center">
          <h1 className="font-display text-3xl font-medium tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error occurred ({error.message || "unknown error"}).
          </p>
          <button
            type="button"
            onClick={reset}
            className="btn-primary mt-6"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
