"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // console.error alone means the crash exists only in the viewer's own
    // devtools. Sentry.captureException is a no-op until a DSN is configured,
    // so this is safe to ship ahead of one — and without it, setting the DSN
    // later would still report nothing from any error boundary.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main className="page-content py-10">
      <ErrorState
        title="Couldn&apos;t load this book"
        description="Something went wrong. Try again."
        action={<Button onClick={reset}>Retry</Button>}
      />
    </main>
  );
}
