"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // `error` was declared in the props type and then destructured away, so a
  // crash on this page went nowhere at all — no report, and not even a
  // console line. These are two of the most reader-facing routes in the
  // product; a failure here was invisible to everyone including the viewer.
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <div className="page-content py-8">
      <ErrorState
        title="Couldn&apos;t load this chapter"
        description="Try again or return to the book."
        action={<Button onClick={reset}>Retry</Button>}
      />
    </div>
  );
}
