"use client";

// Age-gate modal (Week 1 / ROADMAP Phase 0.3).
//
// Renders a confirmation modal when a reader hits a book flagged
// `is_adult_content=true` and:
//   - they are not yet age-verified (server-side `profiles.age_verified_at`
//     is null), AND
//   - they have not previously confirmed in this browser (30-day
//     `localStorage` flag).
//
// On "I am 18+" → POSTs to /api/reader/age-verify (best-effort) and writes
// the localStorage flag. On "Take me back" → router.back().
//
// Server-side gating is the authoritative check; this modal is the UX layer.
// Sites that need real enforcement must check `is_adult_content` + verify
// status server-side and 404/redirect un-verified visitors. The modal does
// not enforce by itself.

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "verkli.ageGate.confirmedAt";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Props = {
  /**
   * If the server already knows this reader is age-verified, pass true. The
   * modal will skip rendering. Pass false (or omit) when the reader is
   * anonymous OR has no age_verified_at recorded.
   */
  alreadyVerified?: boolean;
  /**
   * Optional: a label for the content being gated, surfaced in the dialog
   * copy ("This book contains adult themes." or similar).
   */
  contentLabel?: string;
};

function readLocalConfirmation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts < TTL_MS;
  } catch {
    return false;
  }
}

function writeLocalConfirmation(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

// useSyncExternalStore hooks: localStorage flag reads as part of render,
// SSR-safe because getServerSnapshot returns "confirmed = true" so the
// modal is hidden until hydration runs the real check on the client.
const noopSubscribe = () => () => {};
const readClientConfirmation = () => readLocalConfirmation();
const readServerConfirmation = () => true;

export default function AgeGateModal({ alreadyVerified = false, contentLabel }: Props) {
  const router = useRouter();
  const localConfirmed = useSyncExternalStore(
    noopSubscribe,
    readClientConfirmation,
    readServerConfirmation
  );
  const [dismissed, setDismissed] = useState(false);
  const open = !alreadyVerified && !localConfirmed && !dismissed;

  if (!open) return null;

  const onConfirm = () => {
    writeLocalConfirmation();
    setDismissed(true);
    void fetch("/api/reader/age-verify", { method: "POST" }).catch(() => {
      /* anonymous reader or transient — local flag still applies */
    });
  };

  const onDecline = () => {
    setDismissed(true);
    router.back();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 id="age-gate-title" className="text-lg font-semibold tracking-tight">
          Adult content
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {contentLabel ?? "This book contains content intended for adult audiences."}{" "}
          By continuing, you confirm that you are at least 18 years old.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDecline}
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Take me back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
          >
            I am 18 or older
          </button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Your confirmation is remembered for 30 days on this device.
        </p>
      </div>
    </div>
  );
}
