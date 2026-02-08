"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PurchaseSuccessRefresh() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <p className="mt-2 text-emerald-700 dark:text-emerald-300">
      Betalning genomförd. Uppdaterar åtkomst…
    </p>
  );
}
