"use client";

import { useEffect, useState } from "react";

export default function OfflineModeIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateState = () => setIsOnline(navigator.onLine);
    updateState();

    window.addEventListener("online", updateState);
    window.addEventListener("offline", updateState);
    return () => {
      window.removeEventListener("online", updateState);
      window.removeEventListener("offline", updateState);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div role="status" className="pointer-events-none fixed right-4 top-4 z-50 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[12px] text-amber-900 shadow-sm backdrop-blur dark:text-amber-200">
      <p className="font-semibold">No internet connection</p>
      <p>Reconnect to continue reading or listening.</p>
    </div>
  );
}
