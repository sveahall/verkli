"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Retry the failed jobs on one queue.
 *
 * Rendered only when a queue actually has failures — an always-visible retry
 * control on a healthy queue is a button whose only possible outcome is "0
 * retried", which trains operators to ignore it.
 */
export function RetryFailedButton({
  queueName,
  failedCount,
}: {
  queueName: string;
  failedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (failedCount <= 0) return null;

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-failed", queueName }),
      });
      const body = (await res.json().catch(() => null)) as {
        retried?: number;
        failedToRetry?: number;
        remaining?: number | null;
        error?: unknown;
      } | null;

      if (!res.ok) {
        const detail =
          body && typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
        setMessage(`Retry failed: ${detail}`);
        return;
      }

      // Report what actually moved, not what was asked for. Jobs can refuse to
      // retry, and the batch is capped, so "remaining" is the number that
      // matters for deciding whether to press it again.
      const parts = [`${body?.retried ?? 0} retried`];
      if (body?.failedToRetry) parts.push(`${body.failedToRetry} would not move`);
      if (typeof body?.remaining === "number" && body.remaining > 0) {
        parts.push(`${body.remaining} still failed`);
      } else if (body?.remaining === null) {
        parts.push("remaining count unavailable");
      }
      setMessage(parts.join(", "));

      // The page reads queue counts server-side, so refresh rather than
      // patching a number the server did not confirm.
      router.refresh();
    } catch {
      // The request may well have been processed before the connection dropped,
      // so "nothing was retried" would be a confident claim about state we do
      // not have. Refresh instead and let the counts answer it.
      setMessage("Lost the connection — the outcome is unknown. Counts refreshed below.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={run}>
        {busy ? "Retrying…" : "Retry failed"}
      </Button>
      {message ? (
        <span className="text-[12px] text-slate-500 dark:text-white/50">{message}</span>
      ) : null}
    </div>
  );
}
