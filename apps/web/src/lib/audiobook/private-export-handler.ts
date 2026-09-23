import "server-only";
import { PRIVATE_EXPORT_LIMITS, PrivateExportError, privateExportRequestSchema } from "./private-export-contract";
import { exportPrivateAudio, loadPrivateExportPreview, type PrivateExportDependencies } from "./private-export-service";
type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function readJson(request: Request, signal: AbortSignal) {
  const reader = request.body?.getReader(); if (!reader) throw new PrivateExportError(400, "INVALID_EXPORT", "Send an export request.");
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new PrivateExportError(499, "EXPORT_CANCELLED", "Export cancelled.");
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new PrivateExportError(413, "REQUEST_TOO_LARGE", "Send only an edition, format and source identity."); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PrivateExportError(400, "INVALID_EXPORT", "Send a valid export request."); }
  } finally { signal.removeEventListener("abort", abort); try { await reader.cancel(); } catch { /* Preserve the request error. */ } reader.releaseLock(); }
}
export function createPrivateExportHandlers(deps: PrivateExportDependencies) {
  async function handle(request: Request, context: Context, method: "GET" | "POST") {
    const timer = AbortSignal.timeout(PRIVATE_EXPORT_LIMITS.deadlineMs), signal = AbortSignal.any([request.signal, timer]);
    try {
      const { id } = await context.params;
      if (method === "GET") {
        const query = new URL(request.url).searchParams;
        if ([...query.keys()].some((key) => key !== "editionId") || query.getAll("editionId").length !== 1) throw new PrivateExportError(400, "INVALID_EDITION", "Choose one book edition.");
        const preview = await loadPrivateExportPreview(deps, id, query.get("editionId")!, signal);
        signal.throwIfAborted();
        return Response.json(preview, { headers: privateHeaders });
      }
      const parsed = privateExportRequestSchema.safeParse(await readJson(request, signal));
      if (!parsed.success) throw new PrivateExportError(400, "INVALID_EXPORT", "Send only a supported format and the current edition identity.");
      const result = await exportPrivateAudio(deps, id, parsed.data, signal);
      signal.throwIfAborted();
      const filename = `audiobook-${parsed.data.editionId}-${parsed.data.snapshotId.slice(0, 12)}-${parsed.data.format}.${result.extension}`;
      return new Response(new Uint8Array(result.audio), { headers: { ...privateHeaders, "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${filename}"`, "X-Export-Filename": filename, "X-Export-Duration": String(result.durationSeconds), "X-Export-Chapters": String(result.chapters.length) } });
    } catch (cause) {
      const error = signal.aborted ? new PrivateExportError(request.signal.aborted ? 499 : 504, "EXPORT_INTERRUPTED", request.signal.aborted ? "Export cancelled. No download was published." : "Audio export exceeded its time limit. No download was published.") : cause instanceof PrivateExportError ? cause : new PrivateExportError(500, "EXPORT_FAILED", "The audio export could not be completed within the current limits. No download was published.");
      console.error("[audiobook export] request failed", { code: error.code, status: error.status });
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: privateHeaders });
    }
  }
  return { GET: (request: Request, context: Context) => handle(request, context, "GET"), POST: (request: Request, context: Context) => handle(request, context, "POST") };
}
