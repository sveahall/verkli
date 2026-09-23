"use client";

import { useState } from "react";
import { OFFLINE_UNAVAILABLE_MESSAGE } from "@/lib/offline/availability";
import { retireOfflineServiceWorker } from "@/lib/offline/service-worker";

type Props = {
  bookId: string;
  userId: string;
  languageCode: string;
};

export default function OfflineSaveButton(props: Props) {
  void props;
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearSavedCopies = async () => {
    setIsBusy(true);
    setStatus(null);
    setError(null);
    try {
      await retireOfflineServiceWorker();
      setStatus("Previously saved copies have been removed from this device.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove saved copies. Close other Verkli tabs and try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="max-w-md text-sm">
      <p className="text-muted-foreground">{OFFLINE_UNAVAILABLE_MESSAGE}</p>
      <p className="mt-1 text-xs text-muted-foreground">Previously saved copies are no longer available. You can remove their stored data below.</p>
      <button type="button" disabled={isBusy} onClick={() => void clearSavedCopies()} className="mt-2 min-h-11 rounded-lg border border-border px-3 text-foreground disabled:opacity-60">
        {isBusy ? "Removing saved copies..." : "Remove previously saved copies"}
      </button>
      {status && <p role="status" className="mt-2 text-xs text-muted-foreground">{status}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
