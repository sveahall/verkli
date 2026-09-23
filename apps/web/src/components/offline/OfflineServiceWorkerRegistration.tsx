"use client";

import { useEffect } from "react";
import { retireOfflineServiceWorker } from "@/lib/offline/service-worker";

export default function OfflineServiceWorkerRegistration() {
  useEffect(() => {
    // Run even when the feature flag is off: earlier releases may have saved
    // private HTML or chapter text before this browser received the safety fix.
    void retireOfflineServiceWorker().catch((error) => {
      console.error("[offline] legacy storage cleanup failed; close other Verkli tabs and retry", error);
    });
  }, []);

  return null;
}
