"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_INTERVAL = 3000;
const MAX_ATTEMPTS = 10; // 10 × 3s = 30s

export default function PurchaseSuccessRefresh() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const timedOut = attempt >= MAX_ATTEMPTS;

  useEffect(() => {
    if (timedOut) return;
    const t = setTimeout(() => {
      router.refresh();
      setAttempt((prev) => prev + 1);
    }, POLL_INTERVAL);
    return () => clearTimeout(t);
  }, [router, attempt, timedOut]);

  if (timedOut) {
    return (
      <p className="mt-2 text-amber-700 dark:text-amber-300">
        Payment received. If access hasn&apos;t updated,{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="underline"
        >
          reload the page
        </button>
        .
      </p>
    );
  }

  return (
    <p className="mt-2 text-emerald-700 dark:text-emerald-300">
      Payment complete. Updating access…
    </p>
  );
}
