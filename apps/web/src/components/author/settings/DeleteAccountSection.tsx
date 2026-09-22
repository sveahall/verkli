"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { resolveErrorMessage } from "@/lib/error-messages";

type Result = { ok: boolean; message: string };

async function call(method: "POST" | "DELETE"): Promise<Result> {
  let response: Response;
  try {
    response = await fetch("/api/account/delete", { method });
  } catch {
    return { ok: false, message: "Could not reach Verkli. Check your connection and try again." };
  }
  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; signedOut?: boolean; error?: string }
    | null;
  if (!response.ok) return { ok: false, message: resolveErrorMessage(body?.error) };
  return { ok: true, message: "" };
}

/**
 * Requesting and withdrawing account deletion.
 *
 * What this does NOT claim is the point. `/api/account/delete` records the
 * request and signs the author out; it does not delete anything, because the
 * teardown has to unwind Stripe, entitlements and payouts in order, and the
 * account row itself cascades to purchase history. So the copy promises a
 * request that a person will act on, and says plainly that it can be withdrawn
 * — anything stronger would be a promise this system does not keep.
 */
export default function DeleteAccountSection({ requestedAt }: { requestedAt: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setError(null);
    const result = await call(method);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (method === "POST") {
      // The request signs the session out; land on sign-in rather than leaving
      // a signed-out page that still looks signed in.
      window.location.href = "/author/signin";
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  if (requestedAt) {
    return (
      <section
        aria-labelledby="settings-deletion-pending-title"
        className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5 sm:p-6 dark:border-amber-500/30 dark:bg-amber-500/10"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div className="min-w-0">
            <h2 id="settings-deletion-pending-title" className="text-sm font-medium">Deletion requested</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              You asked us to delete this account on{" "}
              <time dateTime={requestedAt}>{new Date(requestedAt).toLocaleDateString()}</time>. Nothing has been
              deleted yet — we will contact you by email before anything is removed, and your books and readers are
              unaffected until then. You can withdraw the request.
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("DELETE")}
              className="mt-4 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Withdrawing…" : "Keep my account"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="settings-delete-title"
      className="rounded-2xl border border-red-200 p-5 sm:p-6 dark:border-red-500/30"
    >
      <h2 id="settings-delete-title" className="text-sm font-medium">Delete account</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        We record your request and sign you out. A person reviews it before anything is removed, because closing an
        account has to unwind payouts, subscriptions and reader purchases in order. You can withdraw the request by
        signing back in.
      </p>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!confirming ? (
        <button
          type="button"
          onClick={() => { setConfirming(true); setError(null); }}
          className="mt-4 min-h-11 rounded-full border border-red-200 px-5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          Request account deletion
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm leading-relaxed">
            Send the request and sign out? Your published books stay available to readers who bought them until the
            request is processed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("POST")}
              className="min-h-11 rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send request and sign out"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="min-h-11 rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
