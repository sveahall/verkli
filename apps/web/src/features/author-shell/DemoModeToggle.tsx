"use client";

import { useSyncExternalStore } from "react";

/**
 * Floating "Toggle demo mode" button for local development.
 *
 * Renders only when running on localhost AND in development mode. Uses a
 * plain HTML <form> POST so it works even when React hydration is partly
 * broken on the underlying page (e.g. the Library hydration mismatch on
 * /author/library would otherwise eat React click handlers).
 *
 * The matching API route flips `profiles.demo_mode` for the signed-in user
 * and 303-redirects back to the referer, which gives us a free page reload
 * so the layout re-evaluates `isDemoModeActive` and the Production sidebar
 * entry appears/disappears.
 */
function subscribeNoop(): () => void {
  return () => undefined;
}

function isLocalhostClient(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "development") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

export default function DemoModeToggle() {
  // useSyncExternalStore: server snapshot is always false (so SSR renders
  // nothing — no hydration mismatch on the pill itself), client snapshot
  // checks window.location at first render.
  const visible = useSyncExternalStore(
    subscribeNoop,
    isLocalhostClient,
    () => false
  );

  if (!visible) return null;

  // Position: bottom-left to dodge the Next.js dev indicator (bottom-right).
  // Z-index pushed past anything reasonable so we land on top of every
  // overlay, including dev-mode error popups.
  return (
    <form
      method="post"
      action="/api/dev/toggle-demo-mode"
      className="pointer-events-none fixed bottom-4 left-4 z-[2147483646] flex flex-col items-start gap-1"
      aria-live="polite"
    >
      <button
        type="submit"
        className="pointer-events-auto rounded-full border-2 border-amber-400 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900 shadow-lg transition hover:bg-amber-100"
      >
        🎭 Toggle demo mode (dev)
      </button>
    </form>
  );
}
