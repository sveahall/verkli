import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/types";
import { getServerEnv } from "@/lib/env";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { EXPORT_SAMPLE_RATE, exportProfile, type ExportFormat, type ExportChapter } from "./export-contract";
import { FULL_BOOK_EXPORT_SOURCE_LIMITS, fullBookExportRequestSchema } from "./full-book-export-contract";
import { runFullBookJob, checkpointExportJob, type ExportArtifact, type ExportSingleArtifact, type ExportJobRecord, type ExportJobStore } from "./full-book-export-jobs";
import { encodeFullBookAudio } from "./full-book-export-encoder";
import { loadPrivateExportSnapshot } from "./full-book-export-source";
import { PrivateExportError, privateExportMetadata, privateSnapshotId } from "./private-export-contract";
import { parseTimingSidecar } from "./timing-storage";
import { multipart, partIdentity, reconcileExportCleanup, validateCleanupLedger, sameArtifact } from "./full-book-export-cleanup";
import { FULL_BOOK_EXPORT_PART_LIMITS, stageExportParts, validateExportPartManifest, type ExportPartManifest } from "./full-book-export-parts";
import { enqueueFullBookExport } from "./full-book-export-queue";

type Client = SupabaseClient<Database>;
const uuid = z.string().uuid();
const artifactSchema = z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive().max(512 * 1024 ** 2), durationSeconds: z.number().finite().positive(), chapterCount: z.number().int().positive().max(500) }).strict();
const outputFields = { attemptId: uuid.nullable(), leaseUntil: z.number().int().nonnegative(), phase: z.string().max(200), progress: z.number().int().min(0).max(100), message: z.string().max(1000).nullable() };
const outputSchema = z.union([
  z.object({ version: z.literal(1), ...outputFields, artifact: artifactSchema.nullable() }).strict(),
  z.object({ version: z.literal(2), ...outputFields, artifact: z.unknown(), cleanup: z.array(z.unknown()).max(3) }).strict(),
]);
const rowSchema = z.object({ id: uuid, user_id: uuid, book_id: uuid, book_version_id: uuid, kind: z.literal("audiobook_export"), input: fullBookExportRequestSchema.extend({ version: z.literal(1) }).strict(), output: outputSchema.nullable(), status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]), created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }) }).strict();
const columns = "id,user_id,book_id,book_version_id,kind,input,output,status,created_at,updated_at";
const initialOutput = { version: 1 as const, attemptId: null, leaseUntil: 0, phase: "Waiting for export worker", progress: 0, message: null, artifact: null };
function enabled() {
  if (process.env.AUDIOBOOK_FULL_EXPORT_ENABLED !== "true") throw new PrivateExportError(503, "EXPORT_DISABLED", "Full-book export is not enabled on this server.");
}
function failure(code: string, message: string): never { throw new PrivateExportError(503, code, message); }
function databaseSignal(signal?: AbortSignal) { return AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]); }
function databaseError(error: unknown) { if (error) { console.error("[audiobook export] job metadata operation failed"); failure("EXPORT_JOB_UNAVAILABLE", "Could not update the audio export. Try again shortly."); } }
export function artifactPath(job: Pick<ExportJobRecord, "ownerId" | "bookId" | "id" | "input" | "attemptId">) {
  if (!job.attemptId) throw new Error("Full-book export has no active attempt.");
  for (const id of [job.ownerId, job.bookId, job.id, job.input.editionId, job.attemptId]) uuid.parse(id);
  return `exports/${job.ownerId}/${job.bookId}/${job.input.editionId}/${job.id}/${job.attemptId}.${exportProfile(job.input.format).extension}`;
}
export function parseExportRow(value: unknown): ExportJobRecord {
  const row = rowSchema.parse(value);
  if (row.book_version_id !== row.input.editionId || (!row.output && row.status !== "pending")) throw new Error("Invalid full-book export row identity.");
  const output = row.output ?? initialOutput;
  const input = fullBookExportRequestSchema.parse({ editionId: row.input.editionId, format: row.input.format, snapshotId: row.input.snapshotId, requestId: row.input.requestId });
  const record: ExportJobRecord = { id: row.id, ownerId: row.user_id, bookId: row.book_id, input, status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: row.updated_at, attemptId: output.attemptId, leaseUntil: output.leaseUntil, phase: output.phase, progress: output.progress, message: output.message, artifact: null, cleanup: validateCleanupLedger("cleanup" in output ? output.cleanup : [], { id: row.id, ownerId: row.user_id, bookId: row.book_id, input, attemptId: output.attemptId }) };
  record.artifact = output.artifact === null ? null : parseStoredArtifact(output.artifact, record);
  if ((record.status === "completed") !== !!record.artifact || (record.status === "processing" && !record.attemptId) || (record.artifact && !multipart(record.artifact) && record.artifact.path !== artifactPath(record))) throw new Error("Invalid full-book export output identity.");
  return record;
}
function parseStoredArtifact(value: unknown, record: ExportJobRecord): ExportArtifact {
  if (value && typeof value === "object" && "version" in value) return validateExportPartManifest(value, partIdentity(record));
  const artifact = artifactSchema.parse(value); if (artifact.path !== artifactPath(record)) throw new Error("Invalid export artifact path."); return artifact;
}
function outputFor(job: ExportJobRecord): Json {
  const artifact = job.artifact ? parseStoredArtifact(job.artifact, job) : null;
  return JSON.parse(JSON.stringify(outputSchema.parse({ version: 2, attemptId: job.attemptId, leaseUntil: job.leaseUntil, phase: job.phase, progress: job.progress, message: job.message, artifact, cleanup: validateCleanupLedger(job.cleanup, job) }))) as Json;
}
function matches(record: ExportJobRecord, identity: Pick<ExportJobRecord, "id" | "ownerId" | "bookId" | "input">) {
  if (record.id !== identity.id || record.ownerId !== identity.ownerId || record.bookId !== identity.bookId || JSON.stringify(record.input) !== JSON.stringify(fullBookExportRequestSchema.parse(identity.input))) throw new PrivateExportError(409, "EXPORT_IDENTITY_CONFLICT", "This request identity belongs to another export. Reload before making a new request.");
  return record;
}
export function createCancellableExportClient(signal?: AbortSignal): Client {
  enabled(); signal?.throwIfAborted(); const env = getServerEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const metadata = url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/bucket");
    const signals = [...(signal ? [signal] : []), ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : []), ...(metadata ? [AbortSignal.timeout(10000)] : [])];
    return fetch(input, { ...init, ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
  } } });
}
/** Admin access is confined to explicit owner/book/edition/kind filters. No untrusted output is accepted. */
export function createExportJobStore(client: () => Client = createCancellableExportClient): ExportJobStore {
  return {
    async read(identity, signal) {
      const { data, error } = await client().from("ai_jobs").select(columns).eq("id", identity.id).eq("kind", "audiobook_export").eq("user_id", identity.ownerId).eq("book_id", identity.bookId).eq("book_version_id", identity.input.editionId).abortSignal(databaseSignal(signal)).maybeSingle();
      databaseError(error); return data ? matches(parseExportRow(data), identity) : null;
    },
    async insert(record, signal) {
      const { data, error } = await client().from("ai_jobs").insert({ id: record.id, kind: "audiobook_export", user_id: record.ownerId, book_id: record.bookId, book_version_id: record.input.editionId, input: { version: 1, ...fullBookExportRequestSchema.parse(record.input) }, output: outputFor(record), status: record.status, created_at: record.createdAt, updated_at: record.updatedAt }).select(columns).abortSignal(databaseSignal(signal)).single();
      if (error?.code === "23505") { const existing = await this.read(record, signal); if (existing) return existing; throw new PrivateExportError(409, "EXPORT_IDENTITY_CONFLICT", "This request identity belongs to another export. Reload before making a new request."); }
      databaseError(error); return matches(parseExportRow(data), record);
    },
    async compareAndSwap(expected, patch, signal) {
      const next = { ...expected, ...patch }, updatedAt = new Date(Math.max(Date.now(), Date.parse(expected.updatedAt) + 1)).toISOString();
      let query = client().from("ai_jobs").update({ status: next.status, output: outputFor(next), updated_at: updatedAt }).eq("id", expected.id).eq("kind", "audiobook_export").eq("user_id", expected.ownerId).eq("book_id", expected.bookId).eq("book_version_id", expected.input.editionId).eq("updated_at", expected.updatedAt).eq("status", expected.status);
      query = expected.attemptId ? query.eq("output->>attemptId", expected.attemptId) : query.is("output->>attemptId", null);
      if (expected.status === "processing" && next.attemptId === expected.attemptId && ["processing", "completed"].includes(next.status) && Object.keys(patch).some((key) => key !== "cleanup")) query = query.gt("output->>leaseUntil", String(Date.now()));
      const { data, error } = await query.select(columns).abortSignal(databaseSignal(signal)).maybeSingle(); databaseError(error); return data ? matches(parseExportRow(data), expected) : null;
    },
  };
}
export async function exportStorageCapacity(client: Client, format: ExportFormat, signal: AbortSignal, multipartOutput = true) {
  signal.throwIfAborted(); const { data, error } = await client.storage.getBucket(getAudiobookStorageBucket()); signal.throwIfAborted();
  const mime = exportProfile(format).contentType, allowed = data?.allowed_mime_types;
  if (error || !data || data.public !== false || typeof data.file_size_limit !== "number" || !Number.isFinite(data.file_size_limit) || data.file_size_limit < 1 || !Array.isArray(allowed) || !allowed.some((entry) => entry === mime || entry === "audio/*" || entry === "*/*")) failure("EXPORT_STORAGE_UNAVAILABLE", "Private audio export storage is not configured for this format.");
  return Math.min(multipartOutput ? FULL_BOOK_EXPORT_PART_LIMITS.maxPartBytes : 512 * 1024 ** 2, Math.floor(data.file_size_limit));
}
/** Consumption is sequential and bounded; cancellation closes the upstream HTTP body. */
export async function readExportObject(client: Client, objectPath: string, maximum: number, signal: AbortSignal, consume: (chunk: Uint8Array) => Promise<void>) {
  signal.throwIfAborted(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => { void reader?.cancel().catch(() => undefined); };
  try {
    const parameters = { signal, cache: "no-store", redirect: "error" } satisfies RequestInit;
    const { data, error } = await client.storage.from(getAudiobookStorageBucket()).download(objectPath, {}, parameters).asStream();
    if (error || !data) failure("SOURCE_READ_FAILED", "Could not read verified existing audio. Try again shortly.");
    reader = data.getReader(); signal.addEventListener("abort", abort, { once: true }); signal.throwIfAborted(); let bytes = 0;
    while (true) {
      const { value, done } = await reader.read(); signal.throwIfAborted(); if (done) break;
      bytes += value.byteLength; if (bytes > maximum) throw new PrivateExportError(413, "SOURCE_TOO_LARGE", "Existing audio exceeds this export's source size limit.");
      await consume(value); signal.throwIfAborted();
    }
    if (!bytes) throw new PrivateExportError(422, "SOURCE_UNVERIFIED", "Existing audio is empty."); return bytes;
  } finally {
    signal.removeEventListener("abort", abort); if (reader) { try { await reader.cancel(); } catch { /* Preserve the original failure. */ } reader.releaseLock(); }
  }
}
export async function buildFullBookExport(job: ExportJobRecord, signal: AbortSignal, progress: (phase: string, percent: number) => Promise<void>, prepare?: (manifest: ExportPartManifest) => Promise<void>): Promise<ExportArtifact> {
  const client = createCancellableExportClient(signal), maximum = await exportStorageCapacity(client, job.input.format, signal);
  const source = await loadPrivateExportSnapshot(client, job.ownerId, job.bookId, job.input.editionId, signal, FULL_BOOK_EXPORT_SOURCE_LIMITS);
  if (privateSnapshotId(source, FULL_BOOK_EXPORT_SOURCE_LIMITS) !== job.input.snapshotId) throw new PrivateExportError(409, "SOURCE_CHANGED", "The edition or its audio changed. Reload before exporting again.");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-full-export-source-")); let result: Awaited<ReturnType<typeof encodeFullBookAudio>> | undefined, staged: Awaited<ReturnType<typeof stageExportParts>> | undefined;
  try {
    const chapters: ExportChapter[] = [], timingEnds: number[] = [];
    for (const [index, chapter] of source.chapters.entries()) {
      const audioHash = createHash("sha256"), fileHash = createHash("sha256"), filePath = path.join(temporary, `chapter-${index}.audio`), handle = await fs.open(filePath, "wx", 0o600);
      let count: number;
      try { count = await readExportObject(client, chapter.cache.path, chapter.cache.bytes, signal, async (chunk) => { audioHash.update(chunk); fileHash.update(chunk); await handle.writeFile(chunk); }); } finally { await handle.close(); }
      const objectHash = audioHash.update("\0").update(chapter.text).digest("hex").slice(0, 16);
      if (count !== chapter.cache.bytes || !chapter.cache.path.endsWith(`-${objectHash}.${chapter.cache.path.endsWith(".mp3") ? "mp3" : "wav"}`)) throw new PrivateExportError(422, "AUDIO_HASH_MISMATCH", "An existing audio file could not be verified against this edition.");
      const chunks: Buffer[] = [];
      await readExportObject(client, `${chapter.cache.path}.timing.json`, FULL_BOOK_EXPORT_SOURCE_LIMITS.timingBytes, signal, async (chunk) => { chunks.push(Buffer.from(chunk)); });
      let timing = null;
      try { timing = parseTimingSidecar(JSON.parse(Buffer.concat(chunks).toString("utf8")), { chapterId: chapter.id, bookVersionId: job.input.editionId, audioPath: chapter.cache.path, sourceText: chapter.text }); } catch { /* Untrusted sidecar fails closed. */ }
      if (!timing) throw new PrivateExportError(422, "AUDIO_PROVENANCE_UNAVAILABLE", "This chapter lacks verified timing for the current text and audio.");
      timingEnds.push(timing.words[timing.words.length - 1].end); chapters.push({ id: chapter.id, title: chapter.title, filePath, sha256: fileHash.digest("hex") });
      await progress("Verifying existing chapter audio", 5 + Math.floor(35 * (index + 1) / source.chapterCount));
    }
    await progress("Encoding full audiobook", 45);
    result = await encodeFullBookAudio({ editionId: job.input.editionId, format: job.input.format, metadata: privateExportMetadata(source), expectedChapterIds: chapters.map((chapter) => chapter.id), chapters }, { sourceRoot: temporary, outputRoot: temporary, signal, limits: { maxOutputBytes: Math.min(FULL_BOOK_EXPORT_PART_LIMITS.maxOutputBytes, maximum * FULL_BOOK_EXPORT_PART_LIMITS.maxParts) } });
    if (result.chapters.length !== chapters.length || result.chapters.some((chapter, index) => chapter.id !== chapters[index].id || timingEnds[index] > (chapter.endSample - chapter.startSample) / EXPORT_SAMPLE_RATE + 0.05)) throw new PrivateExportError(422, "AUDIO_DURATION_MISMATCH", "The exported chapter lengths do not match the verified source timing.");
    if (!prepare) throw new Error("A durable export plan must be saved before upload.");
    const partBytes = Math.min(maximum, await exportStorageCapacity(client, job.input.format, signal));
    staged = await stageExportParts({ identity: partIdentity(job), byteLength: result.byteLength, sha256: result.sha256, durationSeconds: result.durationSeconds, chapterCount: result.chapters.length, filePath: result.filePath, sourceRoot: temporary }, { outputRoot: temporary, partBytes, signal });
    await prepare(staged.manifest); signal.throwIfAborted();
    const uploadedHash = createHash("sha256");
    for (const [index, file] of staged.files.entries()) {
      await progress("Saving and verifying private audio parts", 50 + Math.floor(40 * index / staged.files.length)); signal.throwIfAborted();
      const current = await createExportJobStore().read(job, signal);
      if (!current || current.status !== "processing" || current.attemptId !== job.attemptId || current.leaseUntil <= Date.now()) throw new Error("The export attempt changed before uploading a part.");
      const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)]), stream = createReadStream(file.filePath, { signal: uploadSignal });
      try {
        const { error } = await createCancellableExportClient(uploadSignal).storage.from(getAudiobookStorageBucket()).upload(file.part.path, stream, { contentType: staged.manifest.contentType, upsert: false, duplex: "half", headers: { "Content-Length": String(file.part.byteLength) } });
        if (error) failure("EXPORT_UPLOAD_FAILED", "Could not save the verified export. Try again shortly.");
      } finally { stream.destroy(); }
      const partHash = createHash("sha256");
      const bytes = await readExportObject(client, file.part.path, file.part.byteLength, signal, async (chunk) => { partHash.update(chunk); uploadedHash.update(chunk); });
      if (bytes !== file.part.byteLength || partHash.digest("hex") !== file.part.sha256) failure("EXPORT_UPLOAD_UNVERIFIED", "A stored export part could not be verified. No download was published.");
    }
    if (uploadedHash.digest("hex") !== staged.manifest.sha256) failure("EXPORT_UPLOAD_UNVERIFIED", "The stored export could not be verified. No download was published.");
    return staged.manifest;
  } finally { try { await staged?.cleanup(); await result?.cleanup(); } finally { await fs.rm(temporary, { recursive: true, force: true }); } }
}
export async function removeExportArtifact(artifact: ExportArtifact) {
  const paths = multipart(artifact) ? artifact.parts.map((part) => part.path) : [artifact.path];
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await createCancellableExportClient(AbortSignal.timeout(10000)).storage.from(getAudiobookStorageBucket()).remove(paths.slice(index, index + 100)); databaseError(error);
  }
}

export async function processFullBookExportJob(trusted: ExportJobRecord, lastAttempt: boolean, checkpoint?: (record: ExportJobRecord) => Promise<void>) {
  enabled();
  await runFullBookJob({ store: createExportJobStore(), verify: async (job, signal) => privateSnapshotId(await loadPrivateExportSnapshot(createCancellableExportClient(signal), job.ownerId, job.bookId, job.input.editionId, signal, FULL_BOOK_EXPORT_SOURCE_LIMITS), FULL_BOOK_EXPORT_SOURCE_LIMITS), build: buildFullBookExport, remove: removeExportArtifact, checkpoint }, trusted, { lastAttempt });
}
export async function reconcileFullBookExportCleanup(trusted: ExportJobRecord, checkpoint: (record: ExportJobRecord) => Promise<void>) {
  enabled(); const current = await reconcileExportCleanup(createExportJobStore(), trusted, removeExportArtifact); await checkpointExportJob({ checkpoint }, { ...current, cleanup: validateCleanupLedger(trusted.cleanup, trusted) });
  if (current.cleanup?.length) throw new Error("Export cleanup is not yet confirmed. Keep the durable checkpoint and retry.");
}
export async function reconcileFailedFullBookExport(trusted: ExportJobRecord) {
  enabled(); const store = createExportJobStore(), current = await store.read(trusted);
  if (current && ["pending", "processing"].includes(current.status)) await store.compareAndSwap(current, { status: "failed", phase: "Export failed", message: "The export worker stopped before completion. Start a new export.", artifact: null, leaseUntil: 0 });
  await reconcileExportCleanup(store, trusted, removeExportArtifact);
}

let rateLimiter: { check(ownerId: string): Promise<{ allowed: boolean }> | { allowed: boolean } } | undefined;
/** EOF verification closes mismatched responses with an error; cancellation always releases upstream. */
export function verifiedExportDownload(data: ReadableStream<Uint8Array>, artifact: Pick<ExportSingleArtifact, "sha256" | "byteLength">, signal: AbortSignal): ReadableStream<Uint8Array> {
  const reader = data.getReader(), hash = createHash("sha256"); let bytes = 0, stopped = false;
  let output: ReadableStreamDefaultController<Uint8Array>;
  const cleanup = async () => {
    if (stopped) return; stopped = true; signal.removeEventListener("abort", abort);
    try { await reader.cancel(); } catch { /* Keep the sanitized download error. */ } finally { reader.releaseLock(); }
  };
  const abort = () => { if (!stopped) { output.error(new PrivateExportError(499, "EXPORT_CANCELLED", "Audio download was cancelled.")); void cleanup(); } };
  return new ReadableStream<Uint8Array>({
    start(controller) { output = controller; signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); },
    async pull(controller) {
      try {
        const next = await reader.read(); if (stopped) return; signal.throwIfAborted();
        if (next.done) {
          if (bytes !== artifact.byteLength || hash.digest("hex") !== artifact.sha256) throw new Error("Download integrity mismatch.");
          await cleanup(); controller.close(); return;
        }
        bytes += next.value.byteLength; if (bytes > artifact.byteLength) throw new Error("Download length mismatch.");
        hash.update(next.value); controller.enqueue(next.value);
      } catch { if (!stopped) { controller.error(new PrivateExportError(503, "EXPORT_DOWNLOAD_FAILED", "The private export could not be verified. Download it again.")); await cleanup(); } }
    },
    async cancel() { await cleanup(); },
  });
}
function waitForDownloadAcquisition<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    work.then((result) => { signal.removeEventListener("abort", abort); resolve(result); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}
async function assertOwnedExportEdition(ownerId: string, bookId: string, editionId: string, signal: AbortSignal): Promise<void> {
      const client = createCancellableExportClient(signal);
      const book = await client.from("books").select("id,author_id,deleted_at,demo_run_id").eq("id", bookId).eq("author_id", ownerId).is("deleted_at", null).is("demo_run_id", null).abortSignal(databaseSignal(signal)).maybeSingle();
      signal.throwIfAborted(); databaseError(book.error);
      if (!book.data || book.data.id !== bookId || book.data.author_id !== ownerId || book.data.deleted_at !== null || book.data.demo_run_id !== null) throw new PrivateExportError(404, "EDITION_NOT_FOUND", "This edition is not available in your account.");
      const edition = await client.from("book_versions").select("id,book_id,demo_run_id").eq("id", editionId).eq("book_id", bookId).is("demo_run_id", null).abortSignal(databaseSignal(signal)).maybeSingle();
      signal.throwIfAborted(); databaseError(edition.error);
      if (!edition.data || edition.data.id !== editionId || edition.data.book_id !== bookId || edition.data.demo_run_id !== null) throw new PrivateExportError(404, "EDITION_NOT_FOUND", "This edition is not available in your account.");
}
export function createFullBookExportRuntime() {
  return {
    async authorize(signal: AbortSignal) {
      enabled(); signal.throwIfAborted(); const { requireAuthorRoleForApi } = await import("@/lib/auth/require-author");
      const { user, response } = await requireAuthorRoleForApi(); signal.throwIfAborted();
      if (response || !user) throw new PrivateExportError(response?.status ?? 401, "AUTHOR_AUTH_REQUIRED", "Sign in with author access to export your existing audio."); return user.id;
    },
    async rateLimit(ownerId: string) {
      enabled(); const { createPerUserRateLimiter } = await import("@/lib/rate-limit");
      rateLimiter ??= createPerUserRateLimiter({ name: "audiobook-full-export", maxPerMinute: 2 }); return (await rateLimiter.check(ownerId)).allowed;
    },
    assertEdition: assertOwnedExportEdition,
    async snapshot(ownerId: string, bookId: string, editionId: string, signal: AbortSignal) { return loadPrivateExportSnapshot(createCancellableExportClient(signal), ownerId, bookId, editionId, signal, FULL_BOOK_EXPORT_SOURCE_LIMITS); },
    async capacity(format: ExportFormat, signal: AbortSignal) { return exportStorageCapacity(createCancellableExportClient(signal), format, signal); },
    store: createExportJobStore(),
    async list(ownerId: string, bookId: string, editionId: string, signal: AbortSignal) {
      const { data, error } = await createCancellableExportClient(signal).from("ai_jobs").select(columns).eq("kind", "audiobook_export").eq("user_id", ownerId).eq("book_id", bookId).eq("book_version_id", editionId).order("created_at", { ascending: false }).limit(10).abortSignal(signal); signal.throwIfAborted(); databaseError(error);
      return (data ?? []).map((row) => { const parsed = parseExportRow(row); if (parsed.ownerId !== ownerId || parsed.bookId !== bookId || parsed.input.editionId !== editionId) throw new Error("Full-book export list identity mismatch."); return parsed; });
    },
    async enqueue(record: ExportJobRecord) { enabled(); await enqueueFullBookExport(record); },
    async download(record: ExportJobRecord, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
      if (record.status !== "completed" || !record.artifact) throw new PrivateExportError(409, "EXPORT_NOT_READY", "This export is not ready for download.");
      const artifact = parseStoredArtifact(record.artifact, record), isMultipart = multipart(artifact);
      const parts = isMultipart ? artifact.parts : [{ path: artifact.path, byteLength: artifact.byteLength, sha256: artifact.sha256 }];
      const controller = new AbortController(), bodySignal = AbortSignal.any([signal, controller.signal]);
      const open = async (index: number) => {
        const acquisition = new AbortController(), openSignal = AbortSignal.any([bodySignal, acquisition.signal]);
        const timer = setTimeout(() => acquisition.abort(new PrivateExportError(503, "EXPORT_DOWNLOAD_TIMEOUT", "The private export took too long to open. Try downloading it again.")), 10000);
        try {
          const work = async () => {
            await assertOwnedExportEdition(record.ownerId, record.bookId, record.input.editionId, openSignal);
            const latest = await createExportJobStore().read(record, openSignal);
            if (!latest || latest.status !== "completed" || latest.attemptId !== record.attemptId || !sameArtifact(latest.artifact, artifact)) throw new PrivateExportError(404, "EXPORT_NOT_FOUND", "This export is no longer available in your account.");
            const client = createCancellableExportClient(openSignal);
            if (parts[index].byteLength > await exportStorageCapacity(client, record.input.format, openSignal, isMultipart)) failure("EXPORT_STORAGE_UNAVAILABLE", "Private storage no longer accepts this part size.");
            openSignal.throwIfAborted();
            const parameters = { signal: openSignal, cache: "no-store", redirect: "error" } satisfies RequestInit;
            const { data, error } = await client.storage.from(getAudiobookStorageBucket()).download(parts[index].path, {}, parameters).asStream();
            if (openSignal.aborted || error) { await data?.cancel().catch(() => undefined); openSignal.throwIfAborted(); }
            if (error || !data) failure("EXPORT_DOWNLOAD_FAILED", "Could not download this private export. Try again shortly.");
            return data;
          };
          const data = await waitForDownloadAcquisition(work(), openSignal); clearTimeout(timer);
          if (openSignal.aborted) { await data.cancel().catch(() => undefined); openSignal.throwIfAborted(); }
          return verifiedExportDownload(data, parts[index], bodySignal).getReader();
        } finally { clearTimeout(timer); }
      };
      let index = 0, reader = await open(0), stopped = false;
      const close = async () => { if (stopped) return; stopped = true; controller.abort(); try { await reader.cancel(); } finally { reader.releaseLock(); } };
      const joined = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            while (!stopped) {
              const next = await reader.read(); bodySignal.throwIfAborted();
              if (!next.done) { output.enqueue(next.value); return; }
              reader.releaseLock(); index++;
              if (index === parts.length) { stopped = true; output.close(); return; }
              reader = await open(index);
            }
          } catch { if (!stopped) { output.error(new PrivateExportError(503, "EXPORT_DOWNLOAD_FAILED", "The complete private export could not be verified. Download it again.")); await close().catch(() => undefined); } }
        },
        async cancel() { await close(); },
      });
      return verifiedExportDownload(joined, artifact, bodySignal);

    },
  };
}
