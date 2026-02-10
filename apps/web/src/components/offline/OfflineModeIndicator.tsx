"use client";

import { useEffect, useState } from "react";
import { getOfflineReadingEnabled } from "@/lib/flags";

export default function OfflineModeIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (!getOfflineReadingEnabled()) return;

    const updateState = () => setIsOnline(navigator.onLine);
    updateState();

    window.addEventListener("online", updateState);
    window.addEventListener("offline", updateState);
    return () => {
      window.removeEventListener("online", updateState);
      window.removeEventListener("offline", updateState);
    };
  }, []);

  if (!getOfflineReadingEnabled() || isOnline) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[12px] font-semibold text-amber-900 shadow-sm backdrop-blur dark:text-amber-200">
      Offline-läge
    </div>
  );
}
