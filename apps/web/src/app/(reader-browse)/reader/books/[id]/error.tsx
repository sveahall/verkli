"use client";

import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorState
        title="Couldn&apos;t load this book"
        description="Try again or return to Discover."
        action={<Button onClick={reset}>Retry</Button>}
      />
    </div>
  );
}
