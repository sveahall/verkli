"use client";

import { useEffect } from "react";
import { getOfflineReadingEnabled } from "@/lib/flags";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export default function OfflineServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const run = async () => {
      if (isLocalhost) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
        return;
      }
      if (!getOfflineReadingEnabled()) {
        return;
      }
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.error("[offline] service worker registration failed", error);
      }
    };

    void run();
  }, []);

  return null;
}
