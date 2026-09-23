import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { privateContentHash, privateSnapshotId, type PrivateExportSnapshot } from "./private-export-contract";
import { FULL_BOOK_EXPORT_SOURCE_LIMITS } from "./full-book-export-contract";
const mock = vi.hoisted(() => ({ client: vi.fn(), snapshot: vi.fn(), encode: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.client }));
vi.mock("./full-book-export-source", () => ({ loadPrivateExportSnapshot: mock.snapshot }));
vi.mock("./full-book-export-encoder", () => ({ encodeFullBookAudio: mock.encode }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ SUPABASE_URL: "https://local.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only" }), getRedisConnectionOptions: () => null }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildExportPartManifest, exportPartPath } from "./full-book-export-parts";
import { partIdentity, multipart } from "./full-book-export-cleanup";
import { createFullBookJob, type ExportJobRecord } from "./full-book-export-jobs";
import { createExportJobStore, parseExportRow, exportStorageCapacity, readExportObject, createFullBookExportRuntime, verifiedExportDownload, buildFullBookExport, createCancellableExportClient } from "./full-book-export-supabase";
const owner = "11111111-1111-4111-8111-111111111111", book = "22222222-2222-4222-8222-222222222222", edition = "33333333-3333-4333-8333-333333333333", request = "44444444-4444-4444-8444-444444444444";
const input = { editionId: edition, format: "mp3-128" as const, snapshotId: "a".repeat(64), requestId: request };
const now = "2026-09-23T01:00:00.000Z";
const row = () => ({ id: request, user_id: owner, book_id: book, book_version_id: edition, kind: "audiobook_export", input: { version: 1, ...input }, status: "pending", created_at: now, updated_at: now, output: { version: 1, attemptId: null, leaseUntil: 0, phase: "Waiting", progress: 0, message: null, artifact: null } });
const calls: [string, ...unknown[]][] = [];
let results: { data: unknown; error: unknown }[];
function client() {
  return { from: (table: string) => {
    calls.push(["from", table]); const result = results.shift(); const chain: Record<string, unknown> = {};
    for (const name of ["select", "insert", "update", "eq", "gt", "is", "order", "limit", "abortSignal", "maybeSingle", "single"]) chain[name] = (...args: unknown[]) => { calls.push([name, ...args]); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve); return chain;
  } } as unknown as SupabaseClient<Database>;
}
beforeEach(() => { calls.length = 0; results = []; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("full-book Supabase boundaries", () => {
  it("protects publication with an active lease but allows expired takeover and cancellation", async () => {
    const attempt = "55555555-5555-4555-8555-555555555555";
    const processing = { ...row(), status: "processing", output: { ...row().output, attemptId: attempt, leaseUntil: 1 } };
    const expected = parseExportRow(processing);
    for (const patch of [{ status: "cancelled" as const }, { status: "failed" as const }, { status: "processing" as const, attemptId: request }, { cleanup: [] }]) {
      calls.length = 0; results = [{ data: null, error: null }];
      await createExportJobStore(client).compareAndSwap(expected, patch);
      expect(calls.some(([name]) => name === "gt")).toBe(false);
      expect(calls).toContainEqual(["eq", "output->>attemptId", attempt]);
    }
    calls.length = 0; results = [{ data: null, error: null }];
    await createExportJobStore(client).compareAndSwap(expected, { progress: 12 });
    expect(calls.some(([name, field]) => name === "gt" && field === "output->>leaseUntil")).toBe(true);
  });
  it("bounds store requests and never loses owner deletion or CAS conflicts", async () => {
    const expected = parseExportRow(row()), controller = new AbortController();
    results = [{ data: null, error: null }, { data: null, error: null }];
    const store = createExportJobStore(client);
    expect(await store.read(expected, controller.signal)).toBeNull();
    expect(await store.compareAndSwap(expected, { status: "cancelled" }, controller.signal)).toBeNull();
    const signals = calls.filter(([name]) => name === "abortSignal").map(([, signal]) => signal as AbortSignal);
    expect(signals).toHaveLength(2); controller.abort(); expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("rejects completed artifacts outside the canonical owner and attempt path", () => {
    const complete = { ...row(), status: "completed", output: { ...row().output, attemptId: request, artifact: { path: `exports/${owner}/${book}/${edition}/${request}/${request}.mp3`, sha256: "a".repeat(64), byteLength: 10, durationSeconds: 1, chapterCount: 1 } } };
    expect(parseExportRow(complete).artifact?.byteLength).toBe(10);
    complete.output.artifact.path = "exports/another-owner/file.mp3";
    expect(() => parseExportRow(complete)).toThrow();
  });
  it("rejects empty and oversized source streams without buffering an oversized chunk", async () => {
    for (const chunks of [[], [new Uint8Array(5)]]) {
      const data = new ReadableStream<Uint8Array>({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close(); } });
      const storage = { storage: { from: () => ({ download: () => ({ asStream: async () => ({ data, error: null }) }) }) } } as unknown as SupabaseClient<Database>;
      const consume = vi.fn();
      await expect(readExportObject(storage, "test", 4, new AbortController().signal, consume)).rejects.toThrow(); expect(consume).not.toHaveBeenCalled();
    }
  });

  it("is disabled by default before constructing live clients", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "false");
    await expect(createFullBookExportRuntime().authorize(new AbortController().signal)).rejects.toMatchObject({ code: "EXPORT_DISABLED" });
    expect(calls).toEqual([]);
  });
  it("rejects unknown row versions, input, output and inconsistent edition identity", () => {
    expect(parseExportRow(row())).toMatchObject({ ownerId: owner, input });
    expect(parseExportRow({ ...row(), created_at: "2026-09-23T01:00:00+00:00", updated_at: "2026-09-23T01:00:00.000001+00:00" }).createdAt).toBe(now);
    expect(() => parseExportRow({ ...row(), kind: "audiobook_generation" })).toThrow();
    expect(() => parseExportRow({ ...row(), input: { ...row().input, url: "https://example.com" } })).toThrow();
    expect(() => parseExportRow({ ...row(), output: { ...row().output, version: 2 } })).toThrow();
    expect(() => parseExportRow({ ...row(), book_version_id: owner })).toThrow();
  });
  it("uses ownership, edition, status, timestamp and attempt filters for CAS", async () => {
    const expected = parseExportRow(row()); results = [{ data: { ...row(), status: "cancelled", output: { ...row().output, phase: "Cancelled" } }, error: null }];
    await createExportJobStore(client).compareAndSwap(expected, { status: "cancelled", phase: "Cancelled" });
    for (const pair of [["kind", "audiobook_export"], ["user_id", owner], ["book_id", book], ["book_version_id", edition], ["updated_at", now], ["status", "pending"]]) expect(calls).toContainEqual(["eq", ...pair]);
    expect(calls).toContainEqual(["is", "output->>attemptId", null]);
  });
  it("reads a duplicate insert and rejects reused request identity", async () => {
    results = [{ data: null, error: { code: "23505" } }, { data: row(), error: null }];
    await expect(createFullBookJob(createExportJobStore(client), owner, book, input)).rejects.toThrow();
    expect(calls.filter(([name]) => name === "from")).toHaveLength(2);
  });
  it("accepts initial null output only for a pending versioned request", () => {
    expect(parseExportRow({ ...row(), output: null }).attemptId).toBeNull();
    expect(() => parseExportRow({ ...row(), status: "completed", output: null })).toThrow();
  });
  it("requires private bucket, finite cap and matching allowed MIME", async () => {
    const getBucket = vi.fn(); const storage = { storage: { getBucket } } as unknown as SupabaseClient<Database>;
    getBucket.mockResolvedValue({ data: { public: false, file_size_limit: 1024, allowed_mime_types: ["audio/*"] }, error: null });
    expect(await exportStorageCapacity(storage, "m4b", new AbortController().signal)).toBe(1024);
    for (const patch of [{ public: true }, { file_size_limit: null }, { file_size_limit: Infinity }, { allowed_mime_types: ["audio/mpeg"] }]) {
      getBucket.mockResolvedValue({ data: { public: false, file_size_limit: 1024, allowed_mime_types: ["audio/*"], ...patch }, error: null });
      await expect(exportStorageCapacity(storage, "m4b", new AbortController().signal)).rejects.toThrow();
    }
  });
  it("cancels streamed reads on abort and rejects over-limit data", async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const data = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1])); }, cancel });
    const storage = { storage: { from: () => ({ download: () => ({ asStream: async () => ({ data, error: null }) }) }) } } as unknown as SupabaseClient<Database>;
    const reading = readExportObject(storage, "test", 4, controller.signal, async () => { controller.abort(); });
    await expect(reading).rejects.toThrow(); expect(cancel).toHaveBeenCalled();
  });
});

function sampleSource() {
  const audio = Buffer.from("synthetic-existing-audio"), text = "Hi.", chapter = "55555555-5555-4555-8555-555555555555";
  const audioPath = `cache/${book}/${chapter}-${createHash("sha256").update(audio).update("\0").update(text).digest("hex").slice(0, 16)}.mp3`;
  const snapshot: PrivateExportSnapshot = { ownerId: owner, book: { id: book, authorId: owner, title: "Book", deletedAt: null, demoRunId: null }, edition: { id: edition, bookId: book, language: "en", demoRunId: null }, authorName: "Author", asset: { id: request, bookId: book, language: "en", status: "generated", isSmoke: false, demoRunId: null }, chapterCount: 1, chapters: [{ id: chapter, bookId: book, editionId: edition, order: 0, title: "One", text, cache: { id: request, chapterId: chapter, editionId: edition, contentHash: privateContentHash(text, chapter, edition), voiceId: "voice", modelId: "model", language: "en", path: audioPath, bytes: audio.length } }] };
  const sidecar = { version: 1, chapterId: chapter, bookVersionId: edition, audioPath, timing: { sourceText: text, words: [{ word: text, start: 0, end: 0.5, startOffset: 0, endOffset: 3 }] } };
  return { audio, audioPath, snapshot, sidecar };
}
function databaseRow(job: ExportJobRecord) { return { ...row(), id: job.id, input: { version: 1, ...job.input }, status: job.status, output: { version: 2, attemptId: job.attemptId, leaseUntil: job.leaseUntil, progress: job.progress, phase: job.phase, message: job.message, artifact: job.artifact, cleanup: job.cleanup ?? [] } }; }
function staticQuery(table: string, job: ExportJobRecord, available = true) {
  const data = table === "books" ? { id: book, author_id: available ? owner : request, deleted_at: null, demo_run_id: null } : table === "book_versions" ? { id: edition, book_id: book, demo_run_id: null } : databaseRow(job);
  const chain: Record<string, unknown> = {};
  for (const key of ["select", "eq", "is", "abortSignal", "maybeSingle"]) chain[key] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve); return chain;
}
function mockStorage(source: ReturnType<typeof sampleSource>, options: { audio?: Buffer; sidecar?: unknown; uploadError?: boolean; abortUpload?: AbortController; partBytes?: number; corrupt?: boolean } = {}) {
  const objects = new Map<string, Buffer>(), reads: string[] = [];
  const upload = vi.fn(async (destination: string, stream: NodeJS.ReadableStream) => {
    if (options.abortUpload) { options.abortUpload.abort(); return { error: { message: "untrusted-storage-detail" } }; }
    const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk); objects.set(destination, options.corrupt ? Buffer.from("bad") : Buffer.concat(chunks));
    return { error: options.uploadError ? { message: "untrusted-storage-detail" } : null };
  });
  const remove = vi.fn(async () => ({ error: null }));
  mock.client.mockReturnValue({ from: (table: string) => staticQuery(table, job), storage: { getBucket: async () => ({ data: { public: false, file_size_limit: options.partBytes ?? 1024, allowed_mime_types: ["audio/*"] }, error: null }), from: () => ({ upload, remove, download: (objectPath: string) => ({ asStream: async () => (reads.push(objectPath), { data: new ReadableStream<Uint8Array>({ start(c) { const data = objects.get(objectPath) ?? (objectPath.endsWith("timing.json") ? Buffer.from(JSON.stringify(options.sidecar ?? source.sidecar)) : options.audio ?? source.audio); c.enqueue(data.subarray(0, 2)); c.enqueue(data.subarray(2)); c.close(); } }), error: null }) }) }) } });
  mock.snapshot.mockResolvedValue(source.snapshot);
  mock.encode.mockImplementation(async (input, options) => {
    expect(await fs.readFile(input.chapters[0].filePath)).toEqual(source.audio);
    const filePath = path.join(options.outputRoot, "verified.mp3"); await fs.writeFile(filePath, "output");
    return { filePath, byteLength: 6, sha256: createHash("sha256").update("output").digest("hex"), durationSeconds: 1, contentType: "audio/mpeg", chapters: [{ id: source.snapshot.chapters[0].id, startSample: 0, endSample: 48000 }], cleanup: vi.fn() };
  });
  const job: ExportJobRecord = { ...parseExportRow(row()), status: "processing", leaseUntil: Date.now() + 30000, attemptId: request, input: { ...input, snapshotId: privateSnapshotId(source.snapshot, FULL_BOOK_EXPORT_SOURCE_LIMITS) } };
  return { job, upload, remove, objects, reads };
}
describe("streamed full-book production adapter with mock storage", () => {
  it("writes exact streamed bytes, checks timing, and uploads a unique private path without upsert", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const source = sampleSource(), { job, upload } = mockStorage(source);
    const artifact = await buildFullBookExport(job, new AbortController().signal, async () => undefined, async () => undefined);
    expect(artifact).toMatchObject({ version: 2, byteLength: 6, chapterCount: 1 });
    if (!multipart(artifact)) throw new Error("Expected multipart artifact");
    expect(upload).toHaveBeenCalledWith(artifact.parts[0].path, expect.anything(), expect.objectContaining({ upsert: false, headers: { "Content-Length": "6" }, contentType: "audio/mpeg" }));
    const sourcePath = mock.encode.mock.calls[0][0].chapters[0].filePath; await expect(fs.stat(sourcePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects altered audio, wrong chapter timing and timings beyond measured duration before upload", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const source = sampleSource();
    for (const options of [{ audio: Buffer.alloc(source.audio.length, 3) }, { sidecar: { ...source.sidecar, chapterId: owner } }, { sidecar: { ...source.sidecar, timing: { ...source.sidecar.timing, words: [{ ...source.sidecar.timing.words[0], end: 2 }] } } }]) {
      const { job, upload } = mockStorage(source, options);
      await expect(buildFullBookExport(job, new AbortController().signal, async () => undefined)).rejects.toThrow(); expect(upload).not.toHaveBeenCalled();
    }
  });
  it("preserves planned targets for job-core cleanup after ambiguous upload failure or abort", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true");
    for (const abort of [false, true]) {
      const source = sampleSource(), controller = new AbortController();
      const { job, remove, upload } = mockStorage(source, { uploadError: true, ...(abort ? { abortUpload: controller } : {}) });
      await expect(buildFullBookExport(job, controller.signal, async () => undefined, async () => undefined)).rejects.toMatchObject({ code: "EXPORT_UPLOAD_FAILED" });
      expect(remove).not.toHaveBeenCalled();
      expect(upload.mock.calls[0][1]).toHaveProperty("destroyed", true);
    }
  });
  it("injects request cancellation into storage fetch and bounds metadata requests", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const controller = new AbortController(); const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok")); vi.stubGlobal("fetch", fetchMock);
    createCancellableExportClient(controller.signal);
    const requestFetch = mock.client.mock.calls[0][2].global.fetch;
    await requestFetch("https://local.invalid/storage/v1/object/audiobooks/test", {});
    const injected = fetchMock.mock.calls[0][1]!.signal!; expect(injected.aborted).toBe(false); controller.abort(); expect(injected.aborted).toBe(true);
    createCancellableExportClient(); const metadataFetch = mock.client.mock.calls[1][2].global.fetch;
    await metadataFetch("https://local.invalid/rest/v1/ai_jobs", {}); expect(fetchMock.mock.calls[1][1]!.signal!).toBeInstanceOf(AbortSignal);
  });
  it("verifies download byte length and SHA-256 and closes upstream on consumer cancellation", async () => {
    const bytes = Buffer.from("complete"), artifact = { path: "unused", sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, durationSeconds: 1, chapterCount: 1 };
    const body = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
    expect(await new Response(verifiedExportDownload(body(), artifact, new AbortController().signal)).text()).toBe("complete");
    for (const patch of [{ byteLength: 1 }, { byteLength: 100 }, { sha256: "a".repeat(64) }]) await expect(new Response(verifiedExportDownload(body(), { ...artifact, ...patch }, new AbortController().signal)).text()).rejects.toThrow();
    const cancel = vi.fn(), upstream = new ReadableStream<Uint8Array>({ cancel });
    await verifiedExportDownload(upstream, artifact, new AbortController().signal).cancel(); expect(cancel).toHaveBeenCalled();
    const controller = new AbortController(), cancelAbort = vi.fn();
    const response = new Response(verifiedExportDownload(new ReadableStream<Uint8Array>({ cancel: cancelAbort }), artifact, controller.signal)).text(); controller.abort();
    await expect(response).rejects.toThrow(); expect(cancelAbort).toHaveBeenCalled();
  });
});

describe("edition-only authorization and download acquisition", () => {
  it("checks owned live book and edition without requiring any source audio", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); mock.client.mockImplementation(client);
    results = [{ data: { id: book, author_id: owner, deleted_at: null, demo_run_id: null }, error: null }, { data: { id: edition, book_id: book, demo_run_id: null }, error: null }];
    await createFullBookExportRuntime().assertEdition(owner, book, edition, new AbortController().signal);
    expect(calls.filter(([method]) => method === "from")).toEqual([["from", "books"], ["from", "book_versions"]]);
    for (const pair of [["author_id", owner], ["id", book], ["id", edition], ["book_id", book]]) expect(calls).toContainEqual(["eq", ...pair]);
    expect(calls).toContainEqual(["is", "deleted_at", null]); expect(calls.filter(([method, key]) => method === "is" && key === "demo_run_id")).toHaveLength(2);
    expect(mock.snapshot).not.toHaveBeenCalled();
  });
  it("rejects missing, deleted, demo or mismatched ownership before source queries", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); mock.client.mockImplementation(client);
    for (const bookRow of [null, { id: book, author_id: request, deleted_at: null, demo_run_id: null }, { id: book, author_id: owner, deleted_at: now, demo_run_id: null }, { id: book, author_id: owner, deleted_at: null, demo_run_id: request }]) {
      calls.length = 0; results = [{ data: bookRow, error: null }];
      await expect(createFullBookExportRuntime().assertEdition(owner, book, edition, new AbortController().signal)).rejects.toMatchObject({ status: 404 });
      expect(calls.filter(([method]) => method === "from")).toEqual([["from", "books"]]);
    }
    results = [{ data: { id: book, author_id: owner, deleted_at: null, demo_run_id: null }, error: null }, { data: { id: edition, book_id: request, demo_run_id: null }, error: null }];
    await expect(createFullBookExportRuntime().assertEdition(owner, book, edition, new AbortController().signal)).rejects.toMatchObject({ status: 404 });
  });
  it("times out stalled acquisition and cancels a body arriving after the timeout", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); vi.useFakeTimers();
    try {
      let resolve!: (value: { data: ReadableStream<Uint8Array>; error: null }) => void;
      const pending = new Promise<{ data: ReadableStream<Uint8Array>; error: null }>((done) => { resolve = done; });
      const { job, download } = downloadMock(() => pending);
      const result = createFullBookExportRuntime().download(job, new AbortController().signal);
      const assertion = expect(result).rejects.toMatchObject({ code: "EXPORT_DOWNLOAD_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(10001); await assertion;
      expect(download).toHaveBeenCalled(); const cancel = vi.fn(); resolve({ data: new ReadableStream<Uint8Array>({ cancel }), error: null });
      await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("clears the acquisition timer when the body arrives and keeps request abort for the stream", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); vi.useFakeTimers();
    try {
      const cancel = vi.fn(), controller = new AbortController();
      const { job, download } = downloadMock(async () => ({ data: new ReadableStream<Uint8Array>({ cancel }), error: null }));
      const stream = await createFullBookExportRuntime().download(job, controller.signal);
      const acquisitionSignal = download.mock.calls[0][2].signal as AbortSignal;
      await vi.advanceTimersByTimeAsync(10001); expect(acquisitionSignal.aborted).toBe(false); expect(cancel).not.toHaveBeenCalled();
      const reading = new Response(stream).text(); const assertion = expect(reading).rejects.toThrow(); controller.abort(); await assertion;
      expect(acquisitionSignal.aborted).toBe(true); expect(cancel).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("cancels a body if the request aborts at the moment acquisition resolves", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const controller = new AbortController(), cancel = vi.fn();
    const { job } = downloadMock(async () => { controller.abort(); return { data: new ReadableStream<Uint8Array>({ cancel }), error: null }; });
    await expect(createFullBookExportRuntime().download(job, controller.signal)).rejects.toThrow();
    await Promise.resolve(); expect(cancel).toHaveBeenCalled();
  });
});
function downloadMock(open: () => Promise<{ data: ReadableStream<Uint8Array>; error: null }>) {
  const download = vi.fn<(path: string, options: object, fetchOptions: { signal: AbortSignal }) => { asStream: typeof open }>(() => ({ asStream: open }));
  mock.client.mockReturnValue({ from: (table: string) => staticQuery(table, job), storage: { getBucket: async () => ({ data: { public: false, file_size_limit: 1024, allowed_mime_types: ["audio/*"] }, error: null }), from: () => ({ download }) } });
  const job = parseExportRow({ ...row(), status: "completed", output: { ...row().output, attemptId: request, artifact: { path: `exports/${owner}/${book}/${edition}/${request}/${request}.mp3`, sha256: "a".repeat(64), byteLength: 10, durationSeconds: 1, chapterCount: 1 } } });
  return { job, download };
}

describe("multipart storage integration", () => {
  it("uploads and independently verifies tiny parts, then reconstructs the exact full-file hash", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const f = mockStorage(sampleSource(), { partBytes: 2 });
    const prepare = vi.fn(async () => { expect(f.upload).not.toHaveBeenCalled(); });
    const artifact = await buildFullBookExport(f.job, new AbortController().signal, async () => undefined, prepare);
    if (!multipart(artifact)) throw new Error("Expected v2 manifest");
    expect(artifact.parts).toHaveLength(3); expect(prepare).toHaveBeenCalledWith(artifact); expect(f.upload).toHaveBeenCalledTimes(3);
    for (const part of artifact.parts) expect(f.reads).toContain(part.path);
    expect(mock.encode.mock.calls[0][1].limits.maxOutputBytes).toBe(2 * 4096);
    f.job.status = "completed"; f.job.artifact = artifact;
    const downloaded = Buffer.from(await new Response(await createFullBookExportRuntime().download(f.job, new AbortController().signal)).arrayBuffer());
    expect(downloaded).toEqual(Buffer.from("output")); expect(createHash("sha256").update(downloaded).digest("hex")).toBe(artifact.sha256);
  });
  it("does not PUT without a durable plan, and rejects stored corruption before returning a manifest", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); let f = mockStorage(sampleSource(), { partBytes: 2 });
    await expect(buildFullBookExport(f.job, new AbortController().signal, async () => undefined, async () => { throw new Error("Checkpoint failed"); })).rejects.toThrow("Checkpoint failed"); expect(f.upload).not.toHaveBeenCalled();
    f = mockStorage(sampleSource(), { partBytes: 2, corrupt: true });
    await expect(buildFullBookExport(f.job, new AbortController().signal, async () => undefined, async () => undefined)).rejects.toThrow(); expect(f.upload).toHaveBeenCalledTimes(1);
  });
  it("rechecks ownership before opening the next part and stops after transfer", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true"); const f = mockStorage(sampleSource(), { partBytes: 2 });
    const artifact = await buildFullBookExport(f.job, new AbortController().signal, async () => undefined, async () => undefined); f.job.status = "completed"; f.job.artifact = artifact;
    const adapter = mock.client.mock.results[0].value; let owns = true;
    adapter.from = (table: string) => staticQuery(table, f.job, owns); f.reads.length = 0;
    const stream = await createFullBookExportRuntime().download(f.job, new AbortController().signal); owns = false;
    await expect(new Response(stream).text()).rejects.toThrow(); expect(f.reads).toHaveLength(1);
  });
  it("rejects changed completed manifests between parts, part corruption, and full hash mismatch", async () => {
    vi.stubEnv("AUDIOBOOK_FULL_EXPORT_ENABLED", "true");
    for (const fault of ["manifest", "part", "full"]) {
      const f = mockStorage(sampleSource(), { partBytes: 2 }), artifact = await buildFullBookExport(f.job, new AbortController().signal, async () => undefined, async () => undefined);
      if (!multipart(artifact)) throw new Error("Expected multipart");
      f.job.status = "completed"; f.job.artifact = fault === "full" ? { ...artifact, sha256: "a".repeat(64) } : artifact;
      if (fault === "part") f.objects.set(artifact.parts[1].path, Buffer.from("xx"));
      const stream = await createFullBookExportRuntime().download(f.job, new AbortController().signal);
      if (fault === "manifest") f.job.artifact = { ...artifact, sha256: "a".repeat(64) };
      await expect(new Response(stream).text()).rejects.toThrow();
    }
  });
  it("strictly parses v2 outputs and owner-bound cleanup manifests while E3 outputs remain readable", () => {
    const job = { ...parseExportRow(row()), attemptId: request }, identity = partIdentity(job);
    const manifest = buildExportPartManifest({ identity, byteLength: 2, sha256: "a".repeat(64), durationSeconds: 1, chapterCount: 1 }, [{ index: 0, offset: 0, byteLength: 2, sha256: "b".repeat(64), path: exportPartPath(identity, 0) }]);
    const output = { ...row().output, version: 2, artifact: manifest, attemptId: request, cleanup: [] };
    expect(parseExportRow({ ...row(), status: "completed", output }).artifact).toEqual(manifest);
    expect(() => parseExportRow({ ...row(), status: "completed", output: { ...output, extra: "unknown" } })).toThrow();
    expect(() => parseExportRow({ ...row(), output: { ...output, artifact: null, cleanup: [{ manifest: { ...manifest, ownerId: book }, cleanupAfter: 0 }] } })).toThrow();
    expect(parseExportRow(row()).artifact).toBeNull();
  });
});
