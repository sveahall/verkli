"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/states";

export default function GlobalError({
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
        title="Något gick fel"
        description="Ett oväntat fel uppstod. Försök igen."
        action={
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Försök igen
          </button>
        }
      />
    </main>
  );
}
