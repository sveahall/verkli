"use client";

import { useState } from "react";

export default function ReadingDataExport() {
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/reader/export", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Please sign in again to download your data." : "Could not export your reading data. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `verkli-reading-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Your reading data download has started.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not download your data. Please try again.");
    } finally { setDownloading(false); }
  }

  return (
    <section className="mt-8 space-y-3 border-t border-border pt-6" aria-labelledby="reading-data-heading">
      <h2 id="reading-data-heading" className="text-lg font-semibold">Your reading data</h2>
      <p className="text-sm text-muted-foreground">
        Download your reading preferences, saved books, and reading and listening progress as a JSON file.
        This includes empty lists if you have not started reading yet. Purchases, messages and manuscripts are not included.
      </p>
      <button type="button" onClick={() => void download()} disabled={downloading}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
        {downloading ? "Preparing download..." : "Download reading data"}
      </button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
