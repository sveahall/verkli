"use client";

import { useEffect } from "react";
import { getOfflineReadingEnabled } from "@/lib/flags";

export default function OfflineServiceWorkerRegistration() {
  useEffect(() => {
    if (!getOfflineReadingEnabled()) {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.error("[offline] service worker registration failed", error);
      }
    };

    void register();
  }, []);

  return null;
}
