"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState
        title="Couldn&apos;t load genres"
        description="Try again in a moment."
        action={<Button onClick={reset}>Retry</Button>}
      />
    </div>
  );
}
