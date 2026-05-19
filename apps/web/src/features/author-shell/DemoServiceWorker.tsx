"use client";

import { useEffect } from "react";

/**
 * Registers /demo-sw.js — the demo-only service worker that pre-caches
 * /demo-assets/* and stale-while-revalidates /author/books/* and
 * /reader/books/*. Strictly localhost / *.local; production deployments
 * never run this SW.
 *
 * Mounted globally inside AuthorAppShell behind a `enabled` gate so it
 * only registers when isDemoModeActive(profile)=true.
 */
export function isDemoSwHostAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.endsWith(".local")
  );
}

export default function DemoServiceWorker({ enabled = false }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!isDemoSwHostAllowed(window.location.hostname)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/demo-sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;

        console.info("[demo-sw] registered", { scope: reg.scope });
      })
      .catch((err) => {

        console.warn("[demo-sw] registration failed", err);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
