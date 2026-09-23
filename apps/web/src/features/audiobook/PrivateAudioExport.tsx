"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import AudioExportPanel, { type LocalExportResult } from "./AudioExportPanel";
import type { ExportFormat } from "@/lib/audiobook/export-contract";

type Props = { bookId: string; editionId: string; endpoint?: string; synthetic?: boolean };
// This browser-facing preview deliberately excludes storage paths and owner metadata.
const label = z.string().min(1).max(200);
const previewSchema = z.object({
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/), editionId: z.string().uuid(),
  metadata: z.object({ title: label, author: label, narrator: label, language: label }).strict(),
  chapters: z.array(z.object({ id: z.string().uuid(), title: label }).strict()).min(1).max(20),
  limits: z.object({ chapters: z.literal(20), sourceBytes: z.literal(20971520), totalSourceBytes: z.literal(83886080), timingBytes: z.literal(2097152), deadlineMs: z.literal(120000) }).strict(),
}).strict();
type Preview = z.infer<typeof previewSchema>;
const button = "min-h-11 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium";
async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  const fallback = response.status === 409 ? "The source edition changed. Reload the source before exporting again."
    : response.status === 413 ? "This edition exceeds the initial export limits. Larger books are not available in this exporter yet."
      : response.status === 422 ? "The existing audio could not be verified. No download is available."
        : "The source or export could not be loaded. Reload the source to try again.";
  return new Error(typeof body?.message === "string" && body.message.length > 0 && body.message.length <= 1000 ? body.message : fallback);
}
export default function PrivateAudioExport({ bookId, editionId, endpoint = `/api/author/books/${bookId}/audiobook/export`, synthetic = false }: Props) {
  return <ScopedPrivateAudioExport key={JSON.stringify([bookId, editionId, endpoint, synthetic])} editionId={editionId} endpoint={endpoint} synthetic={synthetic} />;
}
function ScopedPrivateAudioExport({ editionId, endpoint, synthetic }: { editionId: string; endpoint: string; synthetic: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  useEffect(() => {
    const abort = new AbortController(); active.current = true;
    async function load() {
      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${endpoint}${separator}editionId=${encodeURIComponent(editionId)}`, { cache: "no-store", credentials: "same-origin", signal: abort.signal });
        if (!response.ok) throw await responseError(response);
        const parsed = previewSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.editionId !== editionId || new Set(parsed.data.chapters.map((chapter) => chapter.id)).size !== parsed.data.chapters.length) throw new Error("The source preview could not be verified. No export is available.");
        if (!abort.signal.aborted) setPreview(parsed.data);
      } catch (cause) {
        if (!abort.signal.aborted) { setPreview(null); setError(cause instanceof Error ? cause.message : "The source could not be loaded."); }
      }
    }
    void load();
    return () => { active.current = false; abort.abort(); };
  }, [editionId, endpoint, attempt]);
  async function createExport(format: ExportFormat, signal: AbortSignal): Promise<LocalExportResult> {
    if (!preview) throw new Error("Load and verify the source before exporting.");
    const snapshot = preview;
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, format, snapshotId: snapshot.snapshotId }), signal });
      if (!response.ok) throw await responseError(response);
      const filename = response.headers.get("X-Export-Filename");
      const durationSeconds = Number(response.headers.get("X-Export-Duration"));
      const chapterCount = Number(response.headers.get("X-Export-Chapters"));
      if (!filename || filename.length > 200 || /[\\/\r\n\0]/.test(filename) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || chapterCount !== snapshot.chapters.length) throw new Error("The export response could not be verified. No download is available.");
      return { blob: await response.blob(), filename, durationSeconds, chapterCount };
    } catch (cause) {
      if (active.current && !signal.aborted) { setPreview(null); setError(cause instanceof Error ? cause.message : "Export failed. No download is available."); }
      throw cause;
    }
  }
  return <div className="space-y-6">
    {synthetic && <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm">Simulated source data and synthetic tones only. This fixture does not read real private audio assets or verify a real author account.</p>}
    <aside aria-label="Initial export limits" className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6"><p className="font-medium">Initial synchronous export limits</p><p>Up to 20 chapters, 20 MiB per source file and 80 MiB across source files. Decoded audio is limited to 32 MiB at 48 kHz mono — about 5 minutes 49 seconds. The output limit is 50 MiB, with a 2-minute processing deadline.</p><p className="mt-2 text-muted-foreground">These are technical limits of this initial exporter. Larger books are not available here yet; this is not a premium restriction.</p></aside>
    {error ? <div className="space-y-4"><p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} No download is available.</p><button className={button} onClick={() => { setPreview(null); setError(null); setAttempt((value) => value + 1); }}>Reload source</button></div>
      : preview ? <AudioExportPanel key={preview.snapshotId} createExport={createExport} source={{ ...preview.metadata, chapters: preview.chapters, synthetic }} />
        : <p role="status" aria-live="polite">Loading and verifying the source edition…</p>}
  </div>;
}
