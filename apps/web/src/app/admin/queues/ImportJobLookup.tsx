"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportDiagnostic } from "@/lib/queues/import-diagnostics";

export type ImportLookup = (id: string) => Promise<ImportDiagnostic>;
const lookupImport: ImportLookup = async (id) => {
  const response = await fetch(`/api/admin/imports/${encodeURIComponent(id)}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Import diagnostics are unavailable. Try again.");
  return body;
};
const labels: Record<string, string> = {
  pending: "Queued", queued: "Queued", processing: "Processing", running: "Processing", active: "Processing",
  waiting: "Waiting", delayed: "Waiting to retry", completed: "Completed", failed: "Failed", paused: "Paused",
  prioritized: "Waiting", "waiting-children": "Waiting for child jobs", unknown: "Unknown",
};

export default function ImportJobLookup({ lookup = lookupImport }: { lookup?: ImportLookup }) {
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<ImportDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = ++sequence.current;
    setResult(null); setError(null); setLoading(true);
    try {
      const next = await lookup(reference.trim());
      if (sequence.current === current) setResult(next);
    } catch (cause) {
      if (sequence.current === current) setError(cause instanceof Error ? cause.message : "Import diagnostics are unavailable. Try again.");
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }
  const mismatch = result && result.queue.availability === "available"
    && (["completed", "failed"].includes(result.queue.state ?? "") || ["completed", "failed"].includes(result.status))
    && result.status !== result.queue.state;
  return <section aria-label="Import diagnostics" className="mt-8 space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h2 className="text-lg font-semibold">Find an import</h2><p className="text-sm text-muted-foreground">Use the support reference shown in the author’s import status. This lookup does not retry or change the job.</p></div>
    <form onSubmit={search} className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 gap-1 text-sm">Import reference<input className="min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm" value={reference} required maxLength={36} placeholder="Import ID" onChange={(event) => { sequence.current += 1; setReference(event.target.value); setResult(null); setError(null); setLoading(false); }} /></label>
      <button className="btn-secondary min-h-11" disabled={loading || !reference.trim()}>{loading ? "Looking up…" : "Find import"}</button>
    </form>
    {loading && <p role="status">Loading import and queue status…</p>}
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {!result && !loading && !error && <p className="text-sm text-muted-foreground">Enter an import reference to see its status. Manuscripts, filenames and personal details are not included.</p>}
    {result && <div className="space-y-3 text-sm">
      <p className="break-all">Support reference: <code>{result.id}</code></p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Import record</dt><dd>{labels[result.status] ?? "Unknown"}{result.progress !== null ? ` · ${result.progress}%` : ""}</dd></div>
        <div><dt className="text-muted-foreground">Queue record</dt><dd>{result.queue.availability === "missing" ? "No retained queue record" : result.queue.availability === "unavailable" ? "Queue status unavailable" : labels[result.queue.state ?? "unknown"] ?? "Unknown"}</dd></div>
        <div><dt className="text-muted-foreground">Recorded attempts</dt><dd>{result.queue.attemptsMade ?? "Unknown"}</dd></div>
        <div><dt className="text-muted-foreground">Import last updated</dt><dd>{result.updatedAt}</dd></div>
      </dl>
      {result.queue.availability === "missing" && <p role="status">Queue records may have expired or never been created. This does not prove success or failure.</p>}
      {result.queue.availability === "unavailable" && <p role="alert">The import record was loaded, but queue status could not be verified. Look up the reference again before deciding on recovery.</p>}
      {mismatch && <p role="alert">The import and queue records disagree. Check the saved result and worker before any retry; a new attempt may duplicate work.</p>}
      <p className="text-muted-foreground">These are separate status snapshots. Completed queue work alone does not verify the imported manuscript.</p>
    </div>}
  </section>;
}
