"use client";

import { useEffect } from "react";

/**
 * Registers /demo-sw.js — the demo-only service worker that pre-caches
 * /demo-assets/* and stale-while-revalidates /author/books/* and
 * /reader/books/*. Strictly loopback (localhost / 127.0.0.1 / ::1);
 * production deployments never run this SW.
 *
 * SECURITY (P0): we used to also allow any `*.local` host for mDNS pitch
 * setups (e.g. an iPad hitting the laptop). That widened the surface — on
 * shared infrastructure a spoofable `.local` name could register a SW that
 * caches auth-sensitive pages. The demo flag gates registration too, but
 * defense-in-depth: loopback only. If a future pitch needs LAN access,
 * tunnel it (e.g. localhost via SSH/ngrok) rather than re-opening `.local`.
 *
 * Mounted globally inside AuthorAppShell behind a `enabled` gate so it
 * only registers when isDemoModeActive(profile)=true.
 */
export function isDemoSwHostAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
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
