"use client";
import { useState } from "react";
import AudioExportPanel, { type LocalExportResult } from "@/features/audiobook/AudioExportPanel";
import { type ExportFormat } from "@/lib/audiobook/export-contract";
export default function AudioExportFixture() {
  const [scenario, setScenario] = useState("complete");
  async function createExport(format: ExportFormat, signal: AbortSignal): Promise<LocalExportResult> {
    const response = await fetch("/api/dev/audio-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, scenario }), signal });
    if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error || "The local export could not be created."); }
    return { blob: await response.blob(), filename: response.headers.get("X-Export-Filename") || "synthetic-export", durationSeconds: Number(response.headers.get("X-Export-Duration")), chapterCount: Number(response.headers.get("X-Export-Chapters")) };
  }
  return <><div className="border-b border-border bg-muted/50 px-4 py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><span className="text-xs font-medium uppercase tracking-wider">Local export demo</span><label className="flex items-center gap-2 text-xs">Source scenario<select className="min-h-11 rounded-lg border border-border bg-background px-3" aria-label="Source scenario" value={scenario} onChange={(event) => setScenario(event.target.value)}><option value="complete">Complete synthetic book</option><option value="missing">Missing chapter</option><option value="encoder-error">Encoder unavailable</option><option value="size-limit">Exceeds fixture size limit</option></select></label><p className="text-xs text-muted-foreground">Local files only · no provider, database or real book</p></div></div><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"><AudioExportPanel key={scenario} createExport={createExport} /></main></>;
}
