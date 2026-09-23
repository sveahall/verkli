import "server-only";
import { z } from "zod";
import { createFullBookJob, type ExportJobRecord, type ExportJobStore } from "./full-book-export-jobs";
import { fullBookExportRequestSchema, FULL_BOOK_EXPORT_SOURCE_LIMITS, type FullBookExportJob } from "./full-book-export-contract";
import { privateSnapshotId, privateExportMetadata, PrivateExportError, type PrivateExportSnapshot } from "./private-export-contract";
import { exportProfile, type ExportFormat } from "./export-contract";
export type FullBookExportRuntime = {
  authorize(signal: AbortSignal): Promise<string>;
  rateLimit?(ownerId: string): Promise<boolean>;
  assertEdition(ownerId: string, bookId: string, editionId: string, signal: AbortSignal): Promise<void>;
  snapshot(ownerId: string, bookId: string, editionId: string, signal: AbortSignal): Promise<PrivateExportSnapshot>;
  capacity(format: ExportFormat, signal: AbortSignal): Promise<number>;
  store: ExportJobStore;
  list(ownerId: string, bookId: string, editionId: string, signal: AbortSignal): Promise<ExportJobRecord[]>;
  enqueue(record: ExportJobRecord): Promise<void>;
  download(record: ExportJobRecord, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
};
const uuid = z.string().uuid(), headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const unavailable = () => new PrivateExportError(404, "EXPORT_NOT_FOUND", "This export is not available in your account.");
export function fullBookJobView(job: ExportJobRecord, snapshotId: string | null): FullBookExportJob {
  const stale = job.input.snapshotId !== snapshotId;
  return { id: job.id, editionId: job.input.editionId, format: job.input.format, requestId: job.input.requestId, snapshotId: job.input.snapshotId,
    status: stale && job.status === "completed" ? "failed" : job.status, phase: stale ? "Source changed" : job.phase, progress: job.progress,
    message: stale ? "The source edition changed. Prepare a new export from the current audio." : job.message, createdAt: job.createdAt,
    durationSeconds: !stale && job.status === "completed" ? job.artifact?.durationSeconds ?? null : null,
    byteLength: !stale && job.status === "completed" ? job.artifact?.byteLength ?? null : null };
}
function awaitMetadata<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    work.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}
async function readBody(request: Request, signal: AbortSignal) {
  const reader = request.body?.getReader(); if (!reader) throw new PrivateExportError(400, "INVALID_EXPORT", "Send an export request.");
  const abort = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true });
  let value = "", bytes = 0; const decoder = new TextDecoder();
  try {
    while (true) { signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 4096) throw new PrivateExportError(413, "REQUEST_TOO_LARGE", "Send only the export identity and format."); value += decoder.decode(next.value, { stream: true }); }
    try { return fullBookExportRequestSchema.parse(JSON.parse(value + decoder.decode())); } catch { throw new PrivateExportError(400, "INVALID_EXPORT", "Send a supported format and current source identity."); }
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export function createFullBookExportHandlers(deps: FullBookExportRuntime) {
  async function handle(request: Request, context: { params: Promise<{ id: string }> }, method: "GET" | "POST" | "DELETE") {
    // This deadline only bounds metadata/dispatch. The background worker owns its independent deadline.
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)]);
    try {
      const bookId = uuid.parse((await context.params).id), ownerId = await awaitMetadata(deps.authorize(signal), signal); signal.throwIfAborted();
      if (method === "POST") {
        const input = await readBody(request, signal);
        const source = await deps.snapshot(ownerId, bookId, input.editionId, signal);
        const identity = privateSnapshotId(source, FULL_BOOK_EXPORT_SOURCE_LIMITS);
        if (identity !== input.snapshotId) throw new PrivateExportError(409, "SOURCE_CHANGED", "The source edition changed. Reload before exporting.");
        await deps.capacity(input.format, signal); signal.throwIfAborted();
        if (deps.rateLimit && !await awaitMetadata(deps.rateLimit(ownerId), signal)) throw new PrivateExportError(429, "EXPORT_RATE_LIMIT", "Please wait a minute before preparing another export.");
        const active = (await deps.list(ownerId, bookId, input.editionId, signal)).find((job) => (job.status === "pending" || job.status === "processing") && job.input.requestId !== input.requestId);
        if (active) throw new PrivateExportError(409, "EXPORT_ALREADY_RUNNING", "An export is already queued for this edition. Finish or cancel it before starting another.");
        const job = await createFullBookJob(deps.store, ownerId, bookId, input, signal);
        if (job.status === "pending") await deps.enqueue(job);
        signal.throwIfAborted();
        return Response.json(fullBookJobView(job, identity), { status: 202, headers });
      }
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some((key) => !["editionId", "jobId", "download"].includes(key)) || ["editionId", "jobId", "download"].some((key) => query.getAll(key).length > 1)) throw new PrivateExportError(400, "INVALID_EXPORT", "Choose one edition and export.");
      const editionId = uuid.parse(query.get("editionId"));
      await deps.assertEdition(ownerId, bookId, editionId, signal);
      let source: PrivateExportSnapshot | null = null, identity: string | null = null, sourceError: string | null = null;
      if (method !== "DELETE") {
        try { source = await deps.snapshot(ownerId, bookId, editionId, signal); identity = privateSnapshotId(source, FULL_BOOK_EXPORT_SOURCE_LIMITS); }
        catch (cause) { if (!(cause instanceof PrivateExportError) || cause.status !== 422) throw cause; sourceError = cause.message; }
      }
      const jobs = await deps.list(ownerId, bookId, editionId, signal); signal.throwIfAborted();
      const jobId = query.get("jobId");
      if (jobId) {
        uuid.parse(jobId);
        const job = jobs.find((item) => item.id === jobId); if (!job || job.ownerId !== ownerId || job.bookId !== bookId || job.input.editionId !== editionId) throw unavailable();
        if (method === "DELETE") {
          if (job.status === "pending" || job.status === "processing") {
            const cancelled = await deps.store.compareAndSwap(job, { status: "cancelled", leaseUntil: 0, phase: "Export cancelled", message: "No download was published.", artifact: null }, signal);
            if (!cancelled) throw new PrivateExportError(409, "EXPORT_CHANGED", "The export status changed. Reload to confirm whether cancellation completed.");
            return Response.json(fullBookJobView(cancelled, job.input.snapshotId), { headers });
          }
          return Response.json(fullBookJobView(job, job.input.snapshotId), { headers });
        }
        if (query.has("download")) {
          if (query.get("download") !== "1" || job.input.snapshotId !== identity || job.status !== "completed" || !job.artifact) throw unavailable();
          const stream = await deps.download(job, request.signal);
          if (signal.aborted) { await stream.cancel().catch(() => undefined); signal.throwIfAborted(); }
          const profile = exportProfile(job.input.format), filename = `audiobook-${editionId}-${job.id}-${job.input.format}.${profile.extension}`;
          return new Response(stream, { headers: { ...headers, "Content-Type": profile.contentType, "Content-Length": String(job.artifact.byteLength), "Content-Disposition": `attachment; filename="${filename}"` } });
        }
        return Response.json(fullBookJobView(job, identity), { headers });
      }
      if (method !== "GET" || query.has("download")) throw new PrivateExportError(400, "INVALID_EXPORT", "Choose an export first.");
      const maxOutputBytes = await deps.capacity("m4b", signal); signal.throwIfAborted();
      return Response.json({ editionId, snapshotId: identity, metadata: source ? privateExportMetadata(source) : null, sourceError, chapterCount: source?.chapterCount ?? 0, maxOutputBytes, jobs: jobs.map((job) => fullBookJobView(job, identity)) }, { headers });
    } catch (cause) {
      const error = cause instanceof PrivateExportError ? cause : cause instanceof z.ZodError ? new PrivateExportError(400, "INVALID_EXPORT", "Choose a valid edition and export.") : signal.aborted ? new PrivateExportError(504, "EXPORT_REQUEST_TIMEOUT", "The request timed out. Reload to check the saved export before retrying.") : new PrivateExportError(503, "EXPORT_UNAVAILABLE", "The export could not be loaded or queued. Reload its saved status before retrying.");
      console.error("[audiobook full export] request failed", { code: error.code, status: error.status });
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers });
    }
  }
  return { GET: (r: Request, c: { params: Promise<{ id: string }> }) => handle(r, c, "GET"), POST: (r: Request, c: { params: Promise<{ id: string }> }) => handle(r, c, "POST"), DELETE: (r: Request, c: { params: Promise<{ id: string }> }) => handle(r, c, "DELETE") };
}
