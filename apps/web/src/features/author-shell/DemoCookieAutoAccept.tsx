"use client";

import { useEffect } from "react";

/**
 * Investor-pitch helper: silently pre-accepts the cookie banner so it never
 * overlays the pitch CTAs ("Produce everything", "Launch globally"). The
 * banner is rendered in root layout and lives at the bottom of the viewport
 * — fine for normal users, blocking for a live pitch on 1280×800 laptops.
 *
 * Mounted from AuthorAppShell behind demoModeActive=true. Writes the same
 * COOKIE_KEY value CookieConsent.tsx reads via useSyncExternalStore and
 * dispatches a storage event so the banner hides immediately.
 */
const COOKIE_KEY = "verkli-cookie-consent";

export default function DemoCookieAutoAccept({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(COOKIE_KEY) !== null) return;
      window.localStorage.setItem(COOKIE_KEY, "accepted");
      window.dispatchEvent(new StorageEvent("storage", { key: COOKIE_KEY }));
    } catch {
      // localStorage may be unavailable; harmless — the banner will still show.
    }
  }, [enabled]);

  return null;
}
