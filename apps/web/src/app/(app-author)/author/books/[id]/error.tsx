"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
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
