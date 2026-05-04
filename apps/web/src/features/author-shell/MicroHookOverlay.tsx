"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * "Micro-hook" overlay shown once when the demo author lands on the author
 * shell. Plants the narrative — "you currently have nothing; in the next
 * 60 seconds we make all of it" — and auto-fades.
 *
 * Visibility rules:
 *   - Only when the parent passes demoModeActive=true (gated server-side).
 *   - First mount per browser session: dismissed state is kept in
 *     sessionStorage so it doesn't re-appear on every internal click.
 *   - Disappears on the first user click anywhere on the document.
 *   - Auto-fades after 3 s if no click happens.
 *
 * Built as a client component with a server snapshot of `false` so SSR
 * renders nothing and there's no hydration mismatch.
 */
const SESSION_KEY = "demo_micro_hook_dismissed";

function subscribeNoop(): () => void {
  return () => undefined;
}

function readDismissedClient(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MicroHookOverlay({
  enabled = false,
}: {
  enabled?: boolean;
}) {
  // Read sessionStorage via useSyncExternalStore so SSR renders false and
  // the client renders the right thing on first paint.
  const dismissed = useSyncExternalStore(
    subscribeNoop,
    readDismissedClient,
    () => true
  );
  const [open, setOpen] = useState(true);

  // Auto-fade timer + global click listener for "any click dismisses".
  useEffect(() => {
    if (!enabled || dismissed) return;
    const close = () => {
      setOpen(false);
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // best-effort
      }
    };
    const fadeTimer = window.setTimeout(close, 3000);
    const onClick = () => close();
    window.addEventListener("click", onClick, { once: true, capture: true });
    return () => {
      window.clearTimeout(fadeTimer);
      window.removeEventListener("click", onClick, true);
    };
  }, [enabled, dismissed]);

  if (!enabled || dismissed || !open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-[1100] flex justify-center px-4"
      aria-live="polite"
    >
      <div
        className="rounded-2xl border border-[var(--brand-violet)]/25 bg-white/90 px-4 py-3 text-center shadow-lg backdrop-blur"
        style={{ animation: "demoMicroHookIn 320ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <p className="text-eyebrow">Demo</p>
        <p className="mt-1 text-label text-slate-800">
          0 covers · 0 languages · 0 channels —{" "}
          <span className="font-semibold text-[var(--brand-violet)]">
            we&rsquo;ll make all of this now
          </span>
        </p>
      </div>
      <style>{`
        @keyframes demoMicroHookIn {
          0% { transform: translateY(-12px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
