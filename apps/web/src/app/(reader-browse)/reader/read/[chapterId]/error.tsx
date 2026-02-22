"use client";

import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
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
