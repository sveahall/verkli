import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { encodeFullBookAudio } from "./full-book-export-encoder";
import { runFullBookJob, type ExportJobRecord, type ExportJobStore, type ExportWorkerDependencies } from "./full-book-export-jobs";
import { FULL_BOOK_EXPORT_SOURCE_LIMITS } from "./full-book-export-contract";
import { privateContentHash, privateSnapshotId, validatePrivateSnapshot, PrivateExportError, type PrivateExportSnapshot } from "./private-export-contract";
import { exportProfile } from "./export-contract";
import type { FullBookExportRuntime } from "./full-book-export-handler";
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const FULL_BOOK_FIXTURE_BOOK = id(2), FULL_BOOK_FIXTURE_EDITION = id(3);
export const FULL_BOOK_FIXTURE_SCENARIOS = ["complete", "source-changed", "encoder-error", "missing", "denied"] as const;
export type FullBookFixtureScenario = typeof FULL_BOOK_FIXTURE_SCENARIOS[number];
const root = path.join(os.tmpdir(), `verkli-full-book-fixture-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}`);
type FixtureState = { lock: Promise<unknown>; active: Map<string, Promise<void>>; source?: Promise<{ snapshot: PrivateExportSnapshot; chapters: { id: string; title: string; filePath: string; sha256: string }[] }> };
const scope = globalThis as typeof globalThis & { __verkliFullBookFixture?: FixtureState };
const state: FixtureState = scope.__verkliFullBookFixture ??= { lock: Promise.resolve(), active: new Map() };
function atomic<T>(operation: () => Promise<T>): Promise<T> { const next = state.lock.then(operation); state.lock = next.catch(() => undefined); return next; }
function recordPath(jobId: string, scenario: string) { if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error("Invalid synthetic job"); return path.join(root, scenario, `${jobId}.json`); }
async function load(jobId: string, scenario: string) { try { return JSON.parse(await fs.readFile(recordPath(jobId, scenario), "utf8")) as ExportJobRecord; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function save(record: ExportJobRecord, scenario: string) { await fs.mkdir(path.join(root, scenario), { recursive: true }); const target = recordPath(record.id, scenario); await fs.writeFile(`${target}.tmp`, JSON.stringify(record), { mode: 0o600 }); await fs.rename(`${target}.tmp`, target); }
async function syntheticSource() {
  await fs.mkdir(path.join(root, "sources"), { recursive: true });
  const snapshot: PrivateExportSnapshot = { ownerId: id(1), book: { id: id(2), authorId: id(1), title: "A synthetic journey in 21 chapters", deletedAt: null, demoRunId: null }, edition: { id: id(3), bookId: id(2), language: "en", demoRunId: null }, authorName: "Fixture author", asset: { id: id(4), bookId: id(2), language: "en", status: "generated", isSmoke: false, demoRunId: null }, chapterCount: 21, chapters: [] };
  const chapters = [];
  for (let index = 0; index < 21; index++) {
    const chapterId = id(100 + index), title = `Chapter ${index + 1}`, filePath = path.join(root, "sources", `${chapterId}.wav`), seconds = 18, rate = 48000;
    const header = Buffer.alloc(44), chunk = Buffer.alloc(rate * 2), length = 44 + chunk.length * seconds;
    header.write("RIFF"); header.writeUInt32LE(length - 8, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(length - 44, 40);
    for (let sample = 0; sample < rate; sample++) chunk.writeInt16LE(Math.round(Math.sin(sample / rate * (220 + index * 20) * 2 * Math.PI) * 4000), sample * 2);
    const handle = await fs.open(filePath, "w", 0o600), hash = createHash("sha256"), identity = createHash("sha256");
    try { await handle.write(header); hash.update(header); identity.update(header); for (let second = 0; second < seconds; second++) { await handle.write(chunk); hash.update(chunk); identity.update(chunk); } } finally { await handle.close(); }
    const audioPath = `cache/${id(2)}/${chapterId}-${identity.update("\0").update(title).digest("hex").slice(0, 16)}.wav`;
    chapters.push({ id: chapterId, title, filePath, sha256: hash.digest("hex") });
    snapshot.chapters.push({ id: chapterId, title, text: title, order: index, bookId: id(2), editionId: id(3), cache: { id: id(200 + index), chapterId, editionId: id(3), contentHash: privateContentHash(title, chapterId, id(3)), voiceId: "synthetic-tones", modelId: "synthetic", language: "en", path: audioPath, bytes: length } });
  }
  return { snapshot, chapters };
}
/** Durable local JSON + synthetic WAV only. No database, Redis, provider or real private assets. */
export function createFullBookExportFixture(scenario: FullBookFixtureScenario): FullBookExportRuntime {
  state.source ??= syntheticSource().catch((error) => { state.source = undefined; throw error; });
  const store: ExportJobStore = {
    read: (identity) => atomic(async () => { const row = await load(identity.id, scenario); return row && row.ownerId === identity.ownerId && row.bookId === identity.bookId && row.input.editionId === identity.input.editionId ? row : null; }),
    insert: (record) => atomic(async () => { const row = await load(record.id, scenario); if (row) return row; await save(record, scenario); return record; }),
    compareAndSwap: (expected, patch, signal) => atomic(async () => { signal?.throwIfAborted(); const row = await load(expected.id, scenario); if (!row || row.updatedAt !== expected.updatedAt || row.status !== expected.status || row.attemptId !== expected.attemptId) return null; const updated = { ...row, ...patch, updatedAt: new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString() }; await save(updated, scenario); return updated; }),
  };
  const snapshot = async (ownerId: string, bookId: string, editionId: string, signal: AbortSignal) => { signal.throwIfAborted(); const source = structuredClone((await state.source!).snapshot); if (scenario === "missing") source.chapterCount++; return validatePrivateSnapshot(source, ownerId, bookId, editionId, FULL_BOOK_EXPORT_SOURCE_LIMITS); };
  const artifactFile = (job: ExportJobRecord) => path.join(root, scenario, `${job.id}-${job.attemptId}.${exportProfile(job.input.format).extension}`);
  const worker: ExportWorkerDependencies = {
    store,
    async verify(job, signal) { return privateSnapshotId(await snapshot(job.ownerId, job.bookId, job.input.editionId, signal), FULL_BOOK_EXPORT_SOURCE_LIMITS); },
    async build(job, signal, progress) {
      if (scenario === "encoder-error") throw new Error("Synthetic encoder failure");
      await progress("Encoding 21 synthetic chapters", 20);
      const source = await state.source!;
      const result = await encodeFullBookAudio({ editionId: id(3), format: job.input.format, metadata: { title: source.snapshot.book.title, author: source.snapshot.authorName, narrator: "Synthetic tones", language: "eng" }, expectedChapterIds: source.chapters.map((chapter) => chapter.id), chapters: source.chapters }, { sourceRoot: path.join(root, "sources"), outputRoot: path.join(root, "work"), signal });
      try {
        signal.throwIfAborted(); await progress("Verifying the completed file", 90);
        if (scenario === "source-changed") throw new PrivateExportError(409, "SOURCE_CHANGED", "The simulated source changed. No download was published.");
        await fs.copyFile(result.filePath, artifactFile(job)); signal.throwIfAborted();
        return { path: artifactFile(job), sha256: result.sha256, byteLength: result.byteLength, durationSeconds: result.durationSeconds, chapterCount: result.chapters.length };
      } catch (error) { await fs.rm(artifactFile(job), { force: true }); throw error; }
      finally { await result.cleanup(); }
    },
    async remove(artifact) { if ("path" in artifact && artifact.path.startsWith(path.join(root, scenario) + path.sep)) await fs.rm(artifact.path, { force: true }); },
  };
  const enqueue = async (job: ExportJobRecord) => {
    const key = `${scenario}/${job.id}`; if (state.active.has(key)) return;
    const work = runFullBookJob(worker, job, { lastAttempt: true }).catch(() => { console.error("[audiobook full export fixture] synthetic job failed"); }).finally(() => { state.active.delete(key); });
    state.active.set(key, work);
  };
  return {
    store, snapshot, enqueue, singleFileFixture: true,
    async assertEdition(ownerId, bookId, editionId, signal) { signal.throwIfAborted(); if (ownerId !== id(1) || bookId !== id(2) || editionId !== id(3)) throw new PrivateExportError(404, "EDITION_NOT_FOUND", "The simulated edition is unavailable."); },
    async authorize(signal) { signal.throwIfAborted(); if (scenario === "denied") throw new PrivateExportError(403, "AUTHOR_REQUIRED", "The simulated account does not own this edition."); return id(1); },
    async capacity() { return 512 * 1024 * 1024; },
    async list(ownerId, bookId, editionId) {
      await fs.mkdir(path.join(root, scenario), { recursive: true });
      const rows = await atomic(async () => { const files = await fs.readdir(path.join(root, scenario)); return Promise.all(files.filter((file) => /^[a-f0-9-]{36}\.json$/.test(file)).map((file) => load(file.slice(0, -5), scenario))); });
      const jobs = rows.filter((row): row is ExportJobRecord => !!row && row.ownerId === ownerId && row.bookId === bookId && row.input.editionId === editionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
      // Local fixture restart recovery; production retries are handled by BullMQ.
      for (const job of jobs) if (job.status === "pending" || job.status === "processing" && job.leaseUntil < Date.now()) await enqueue(job);
      return jobs;
    },
    async download(job, signal) { if (!job.artifact || !("path" in job.artifact) || job.artifact.path !== artifactFile(job) || job.status !== "completed") throw new Error("Synthetic artifact unavailable"); const stat = await fs.stat(job.artifact.path); if (stat.size !== job.artifact.byteLength) throw new Error("Synthetic artifact changed"); return Readable.toWeb(createReadStream(job.artifact.path, { signal })) as ReadableStream<Uint8Array>; },
  };
}
