"use client";

import { useState } from "react";

export default function PayoutReportDownload({ label, preparing, failed, signedOut, started }: {
  label: string; preparing: string; failed: string; signedOut: string; started: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (downloading) return;
    setDownloading(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/billing/connect/payout-report", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? signedOut : failed);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "verkli-stripe-payouts-latest-100.csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(started);
    } catch (error) {
      setError(error instanceof Error ? error.message : failed);
    } finally { setDownloading(false); }
  }

  return <div className="space-y-2">
    <button type="button" disabled={downloading} onClick={() => void download()}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
      {downloading ? preparing : label}
    </button>
    {message && <p role="status" className="max-w-xs text-sm text-muted-foreground">{message}</p>}
    {error && <p role="alert" className="max-w-xs text-sm text-destructive">{error}</p>}
  </div>;
}
