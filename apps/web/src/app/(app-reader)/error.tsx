"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/states";

export default function ReaderError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred. Please try again."
        action={
          // An error boundary REPLACES the shell it fires in, so the footer and
          // its support link disappear at exactly the moment the reader needs
          // them. The link has to live inside the boundary itself.
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <Link
              href="/support"
              className="text-[13px] font-medium text-slate-600 underline-offset-4 hover:underline dark:text-white/60"
            >
              Contact support
            </Link>
          </div>
        }
      />
    </main>
  );
}
