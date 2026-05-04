"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Floating "Toggle demo mode" button for local development.
 *
 * Renders only when running on localhost AND in development mode (matched by
 * `process.env.NODE_ENV` baked at build time). Calls the matching dev-only
 * API route which flips `profiles.demo_mode` for the signed-in user, then
 * reloads the page so the layout re-evaluates `isDemoModeActive` and the
 * Production sidebar entry appears/disappears.
 *
 * The component is mounted globally inside AuthorAppShell — it gates itself
 * via `useEffect` so production bundles never even render it.
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
  // useSyncExternalStore avoids the "setState in useEffect" React-compiler
  // warning: server snapshot is always false (so SSR renders nothing), and
  // the client snapshot reads window.location at render time.
  const visible = useSyncExternalStore(
    subscribeNoop,
    isLocalhostClient,
    () => false
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!visible) return null;

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dev/toggle-demo-mode", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        demo_mode?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? `Failed (${res.status})`);
        setPending(false);
        return;
      }
      setMessage(`demo_mode → ${String(json.demo_mode)}; reloading…`);
      // Reload so server components re-render with the new flag.
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div
      // pointer-events-none on the wrapper, restored on the button so the
      // overlay never blocks normal UI hits.
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-1"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="pointer-events-auto rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-[11px] font-medium text-amber-900 shadow-md backdrop-blur transition hover:bg-amber-100 disabled:opacity-60"
      >
        {pending ? "Toggling…" : "Toggle demo mode (dev)"}
      </button>
      {message ? (
        <span className="pointer-events-auto rounded-md bg-slate-900/90 px-2 py-1 text-[11px] text-white shadow">
          {message}
        </span>
      ) : null}
    </div>
  );
}
