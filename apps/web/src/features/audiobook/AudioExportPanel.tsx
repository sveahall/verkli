"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileAudio, Loader2, X } from "lucide-react";
import { exportProfile, type ExportFormat } from "@/lib/audiobook/export-contract";
export type LocalExportResult = { blob: Blob; filename: string; durationSeconds: number; chapterCount: number };
type Props = { createExport: (format: ExportFormat, signal: AbortSignal) => Promise<LocalExportResult> };
const choices = [{ value: "mp3-128", title: "MP3 · 128 kbps", detail: "A compact single audio file." }, { value: "mp3-320", title: "MP3 · 320 kbps", detail: "A larger file at a higher encoding bitrate." }, { value: "m4b", title: "M4B · chaptered", detail: "AAC audio with embedded chapter markers." }] as const;
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
export default function AudioExportPanel({ createExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>("m4b");
  const [phase, setPhase] = useState<"idle" | "working" | "ready" | "failed" | "cancelled">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(LocalExportResult & { url: string }) | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { const url = result?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [result]);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  async function run() {
    const id = ++requestId.current;
    const abort = new AbortController(); controller.current = abort;
    setResult(null); setError(null); setPhase("working");
    try {
      const exported = await createExport(format, abort.signal);
      if (requestId.current !== id || abort.signal.aborted) return;
      if (!exported.blob.size || exported.blob.type !== exportProfile(format).contentType || !Number.isFinite(exported.durationSeconds) || exported.durationSeconds <= 0 || exported.chapterCount !== 3) throw new Error("The export could not be verified. No download is available.");
      setResult({ ...exported, url: URL.createObjectURL(exported.blob) }); setPhase("ready");
    } catch (cause) {
      if (requestId.current !== id) return;
      setError(cause instanceof Error ? cause.message : "The export failed. Please try again."); setPhase("failed");
    }
  }
  function cancel() { requestId.current++; controller.current?.abort(); setResult(null); setError(null); setPhase("cancelled"); }
  return <section className="space-y-7" aria-label="Audio export">
    <header className="border-b border-border pb-6"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Audio / Export</p><h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">A book you can take with you.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Create a real download from three synthetic tone chapters. This demo tests the file format, chapter boundaries and metadata.</p></header>
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_0.85fr]">
      <div className="space-y-5">
        <fieldset disabled={phase === "working"} className="space-y-3"><legend className="mb-3 text-lg font-semibold">Choose your format</legend>{choices.map((choice) => <label key={choice.value} className={`flex cursor-pointer gap-4 rounded-xl border bg-background p-4 ${format === choice.value ? "border-primary ring-1 ring-primary" : "border-border"}`}><input className="mt-1 accent-primary" type="radio" name="export-format" value={choice.value} checked={format === choice.value} onChange={() => { setFormat(choice.value); setResult(null); setError(null); setPhase("idle"); }} /><span><span className="block font-medium">{choice.title}</span><span className="mt-1 block text-sm text-muted-foreground">{choice.detail}</span></span></label>)}</fieldset>
        <p className="text-xs leading-5 text-muted-foreground">The source is synthetic PCM. Re-encoding or upsampling a lower-quality recording does not restore lost quality. M4B uses an AAC 128 kbps profile for this local test.</p>
        <div className="flex flex-wrap gap-3"><button className={`${button} bg-primary text-primary-foreground`} disabled={phase === "working"} onClick={() => void run()}>{phase === "working" ? <Loader2 aria-hidden="true" size={17} className="animate-spin" /> : <FileAudio aria-hidden="true" size={17} />}Create synthetic export</button>{phase === "working" && <button className={button} onClick={cancel}><X aria-hidden="true" size={16} />Cancel export</button>}</div>
        <p role="status" aria-live="polite" className="text-sm">{phase === "working" ? "Encoding and checking the audio file…" : phase === "ready" ? "Verified synthetic export ready." : phase === "cancelled" ? "Export cancelled. No download was published." : phase === "failed" ? "Export failed. No download is available." : "No export created yet."}</p>
        {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}
        {result && <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"><p className="break-words font-medium">{result.filename}</p><p className="text-sm text-muted-foreground">{result.durationSeconds.toFixed(3)} seconds · {result.chapterCount} source chapters · {(result.blob.size / 1024).toFixed(1)} KB</p><a className={`${button} bg-background`} href={result.url} download={result.filename}><Download aria-hidden="true" size={16} />Download {exportProfile(format).extension.toUpperCase()}</a><audio controls preload="metadata" className="w-full" src={result.url} aria-label="Synthetic export playback" /><p className="text-xs text-muted-foreground">Synthetic tones only. This is not a narrated audiobook.</p></div>}
      </div>
      <aside className="space-y-5 rounded-2xl border border-border bg-muted/30 p-6"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Synthetic source edition</p><h2 className="mt-2 font-display text-2xl font-semibold">Vägen hem</h2><p className="mt-2 text-sm text-muted-foreground">Demo author · Synthetic tones · Swedish</p></div><ol className="divide-y divide-border">{["Avfärd", "Över vattnet", "Återkomst"].map((title, i) => <li key={title} className="flex items-center gap-4 py-4"><span className="text-xs text-muted-foreground">0{i + 1}</span><span>{title}</span></li>)}</ol><p className="text-xs leading-5 text-muted-foreground">Chapter times are measured from decoded samples during export. The M4B includes embedded chapter markers. MP3 is a single file with book metadata.</p></aside>
    </div>
  </section>;
}
