"use client";
import { useState } from "react";
import PrivateAudioExport from "@/features/audiobook/PrivateAudioExport";
const bookId = "00000000-0000-4000-8000-000000000002";
const editionId = "00000000-0000-4000-8000-000000000003";
export default function PrivateAudioExportFixture() {
  const [scenario, setScenario] = useState("complete");
  return <><div className="border-b border-border bg-muted/50 px-4 py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><span className="text-xs font-medium uppercase tracking-wider">Local private export demo</span><label className="flex items-center gap-2 text-xs">Source scenario<select className="min-h-11 rounded-lg border border-border bg-background px-3" value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="complete">Complete synthetic edition</option><option value="missing">Missing chapter</option><option value="hash">Audio hash mismatch</option><option value="stale">Source changes during export</option><option value="denied">Access denied</option><option value="wrong-edition">Wrong edition</option><option value="smoke">Smoke-test audio</option><option value="read-error">Storage read failure</option></select></label><p className="text-xs text-muted-foreground">Synthetic database, session and storage adapters · no real private assets</p></div></div><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"><PrivateAudioExport key={scenario} bookId={bookId} editionId={editionId} endpoint={`/api/dev/private-audio-export/${scenario}`} synthetic /></main></>;
}
