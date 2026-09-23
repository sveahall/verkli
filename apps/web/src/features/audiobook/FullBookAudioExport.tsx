"use client";
import { useEffect, useRef, useState } from "react";
import { fullBookExportJobSchema, fullBookExportPreviewSchema, type FullBookExportJob, type FullBookExportPreview } from "@/lib/audiobook/full-book-export-contract";
import type { ExportFormat } from "@/lib/audiobook/export-contract";
const button = "min-h-11 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50";
const running = (job: FullBookExportJob) => job.status === "pending" || job.status === "processing";
async function json(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.message === "string" && body.message.length < 1000 ? body.message : "The export could not be loaded. Try again.");
  return body;
}
export default function FullBookAudioExport(props: { bookId: string; editionId: string; endpoint?: string; synthetic?: boolean }) {
  return <ScopedExport key={JSON.stringify(props)} {...props} />;
}
function ScopedExport({ bookId, editionId, endpoint = `/api/author/books/${bookId}/audiobook/full-export`, synthetic = false }: { bookId: string; editionId: string; endpoint?: string; synthetic?: boolean }) {
  const [preview, setPreview] = useState<FullBookExportPreview | null>(null);
  const [format, setFormat] = useState<ExportFormat>("m4b");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const active = useRef(false), locked = useRef(false), request = useRef<{ id: string; format: ExportFormat; snapshotId: string } | null>(null);
  const query = (values: Record<string, string>) => `${endpoint}${endpoint.includes("?") ? "&" : "?"}${new URLSearchParams({ editionId, ...values })}`;
  useEffect(() => {
    const controller = new AbortController(); active.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const value = fullBookExportPreviewSchema.parse(await json(await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}editionId=${encodeURIComponent(editionId)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" })));
        if (value.editionId !== editionId || value.jobs.some((job) => job.editionId !== editionId)) throw new Error("The export edition could not be verified.");
        if (controller.signal.aborted) return;
        setPreview(value); setError(null);
        if (value.jobs.some(running)) timer = setTimeout(() => void load(), 1500);
      } catch (cause) {
        if (!controller.signal.aborted) { setPreview(null); setError(cause instanceof Error ? cause.message : "The export could not be loaded."); }
      }
    }
    void load();
    return () => { active.current = false; controller.abort(); clearTimeout(timer); };
  }, [editionId, endpoint, refresh]);
  async function create() {
    if (!preview?.snapshotId || locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    if (!request.current || request.current.format !== format || request.current.snapshotId !== preview.snapshotId) request.current = { id: crypto.randomUUID(), format, snapshotId: preview.snapshotId };
    const identity = request.current;
    try {
      const job = fullBookExportJobSchema.parse(await json(await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, format, snapshotId: identity.snapshotId, requestId: identity.id }) })));
      if (job.editionId !== editionId || job.format !== format) throw new Error("The queued export could not be verified.");
      if (!active.current) return;
      request.current = null; setRefresh((value) => value + 1);
    } catch (cause) { if (active.current) { setPreview(null); setError(cause instanceof Error ? cause.message : "The request outcome is unknown. Reload to check the same export before retrying."); } }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function resume(job: FullBookExportJob) {
    if (locked.current) return; locked.current = true; setBusy(true);
    try {
      await json(await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, format: job.format, snapshotId: job.snapshotId, requestId: job.requestId }) }));
      if (active.current) setRefresh((value) => value + 1);
    } catch (cause) { if (active.current) { setPreview(null); setError(cause instanceof Error ? cause.message : "The same request could not be resumed. Reload its status."); } }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function cancel(job: FullBookExportJob) {
    if (locked.current) return; locked.current = true; setBusy(true);
    try { await json(await fetch(query({ jobId: job.id }), { method: "DELETE", credentials: "same-origin" })); if (active.current) setRefresh((value) => value + 1); }
    catch (cause) { if (active.current) { setPreview(null); setError(cause instanceof Error ? cause.message : "Cancellation could not be confirmed. Reload to check its status."); } }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }
  return <section aria-label="Full-book audio export" className="mx-auto max-w-3xl space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Export your audiobook</h1><p className="text-sm text-muted-foreground">Prepare a complete file from your existing chapter audio. You can leave this page and return while the export runs.</p></header>
    {synthetic && <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm">E3 single-file synthetic demonstration: generated tones and simulated account/storage data. This does not test real private audio or paid speech generation.</p>}
    {error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4"><p>{error}</p><button className={button} disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Reload export status</button></div>}
    {!preview && !error && <p role="status">Loading the edition and saved exports…</p>}
    {preview && <>
      {preview.sourceError && <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4"><p>{preview.sourceError} Saved jobs remain available below.</p><button className={button} disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Reload source</button></div>}
      {preview.metadata && preview.snapshotId && <div className="rounded-2xl border border-border p-5"><h2 className="font-semibold">{preview.metadata.title}</h2><p className="mt-1 text-sm text-muted-foreground">{preview.metadata.author} · {preview.chapterCount} verified chapters</p>
        <fieldset className="mt-5 space-y-3" disabled={busy}><legend className="mb-2 text-sm font-medium">Download format</legend>{([ ["mp3-128", "MP3 · 128 kbps"], ["mp3-320", "MP3 · 320 kbps"], ["m4b", "M4B · chaptered"] ] as const).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3"><input type="radio" name="full-export-format" value={value} checked={format === value} onChange={() => { request.current = null; setFormat(value); }} />{label}</label>)}</fieldset>
        <p className="my-4 text-sm text-muted-foreground">Exporting at 320 kbps does not restore detail missing from the source audio. Exports use existing narration and do not order new speech.</p>
        <button className={button} disabled={busy || preview.jobs.some(running)} onClick={() => void create()}>{busy ? "Saving request…" : "Prepare full-book export"}</button>
      </div>}
      <aside aria-label="Export capacity" className="rounded-xl bg-muted/30 p-4 text-sm leading-6">Up to 500 chapters, 128 MiB per source and 2 GiB total source audio. Decoded audio is limited to 8 GiB (about 24 hours at 48 kHz mono). The total output limit is {preview.maxOutputBytes >= 1024 ** 3 ? `${preview.maxOutputBytes / 1024 ** 3} GiB` : `${Math.floor(preview.maxOutputBytes / 1024 ** 2)} MiB`}.{preview.maxPartBytes !== null ? ` Private storage parts are limited to ${preview.maxPartBytes < 1024 ** 2 ? `${preview.maxPartBytes} bytes` : `${Math.floor(preview.maxPartBytes / 1024 ** 2)} MiB`} each, with at most 4096 parts. They download as one complete file; resumable downloads are not supported.` : " This demonstration uses one stored file."} Processing has a one-hour deadline. These are technical capacity limits.</aside>
      <section aria-label="Saved exports" className="space-y-3"><h2 className="font-semibold">Saved exports</h2>{preview.jobs.length === 0 ? <p className="text-sm text-muted-foreground">No exports yet. Choose a format to prepare your first file.</p> : preview.jobs.map((job) => <article key={job.id} data-export-id={job.id} className="space-y-3 rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{job.format.toUpperCase()}</h3><span className="text-sm">{job.status}</span></div><p role={running(job) ? "status" : undefined} className="text-sm">{job.phase}{running(job) ? ` · ${job.progress}%` : ""}</p>{job.message && <p className="text-sm">{job.message}</p>}{job.status === "pending" && preview.snapshotId === job.snapshotId && <button className={button} disabled={busy} onClick={() => void resume(job)}>Resume queued export</button>}{running(job) && <button className={button} disabled={busy} onClick={() => void cancel(job)}>Cancel export</button>}{job.status === "completed" && <a className={`${button} inline-flex items-center`} href={query({ jobId: job.id, download: "1" })}>Download {job.format === "m4b" ? "M4B" : "MP3"}</a>}</article>)}</section>
    </>}
  </section>;
}
