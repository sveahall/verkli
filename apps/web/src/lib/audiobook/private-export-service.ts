import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportLocalAudio } from "./export-local";
import { audioObjectHash, parseTimingSidecar } from "./timing-storage";
import { PRIVATE_EXPORT_LIMITS, PrivateExportError, privateExportEditionSchema, privateExportMetadata, privateExportPreview, privateExportRequestSchema, privateSnapshotId, validatePrivateSnapshot, type PrivateExportRequest } from "./private-export-contract";
export type PrivateExportDependencies = {
  authorize(signal: AbortSignal): Promise<string>;
  snapshot(ownerId: string, bookId: string, editionId: string, signal: AbortSignal): Promise<unknown>;
  readObject(path: string, maxBytes: number, signal: AbortSignal): Promise<Buffer>;
  rateLimit?(ownerId: string): Promise<boolean>;
  encode?: typeof exportLocalAudio;
};
let activeExport = false;
function assertActive(signal: AbortSignal) { if (signal.aborted) throw new PrivateExportError(499, "EXPORT_CANCELLED", "Audio export was cancelled. No download was published."); }
/** Auth/rate-limit helpers do not accept cancellation; stop awaiting without dispatching further work. */
function interruptible<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new PrivateExportError(499, "EXPORT_CANCELLED", "Audio export was cancelled. No download was published."));
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}
function assertIds(bookId: string, editionId: string) { if (!privateExportEditionSchema.safeParse(bookId).success || !privateExportEditionSchema.safeParse(editionId).success) throw new PrivateExportError(400, "INVALID_EDITION", "Choose a valid book edition before exporting audio."); }
const changed = () => new PrivateExportError(409, "SOURCE_CHANGED", "This edition or its audio changed. Reload the source and prepare a new export.");
export async function loadPrivateExportPreview(deps: PrivateExportDependencies, bookId: string, editionId: string, signal: AbortSignal) {
  assertActive(signal); assertIds(bookId, editionId);
  const ownerId = await interruptible(deps.authorize(signal), signal); assertActive(signal);
  const source = validatePrivateSnapshot(await deps.snapshot(ownerId, bookId, editionId, signal), ownerId, bookId, editionId); assertActive(signal);
  return privateExportPreview(source);
}
export async function exportPrivateAudio(deps: PrivateExportDependencies, bookId: string, value: PrivateExportRequest, signal: AbortSignal) {
  assertActive(signal);
  const parsed = privateExportRequestSchema.safeParse(value);
  if (!parsed.success) throw new PrivateExportError(400, "INVALID_EXPORT", "Reload the source edition and choose a supported export format.");
  const input = parsed.data; assertIds(bookId, input.editionId);
  if (activeExport) throw new PrivateExportError(429, "EXPORT_BUSY", "Another audio export is running. Please wait before trying again.");
  activeExport = true;
  let temporary: string | null = null;
  try {
    const ownerId = await interruptible(deps.authorize(signal), signal); assertActive(signal);
    if (deps.rateLimit && !await interruptible(deps.rateLimit(ownerId), signal)) throw new PrivateExportError(429, "EXPORT_RATE_LIMIT", "Please wait a minute before preparing another audio export.");
    const source = validatePrivateSnapshot(await deps.snapshot(ownerId, bookId, input.editionId, signal), ownerId, bookId, input.editionId); assertActive(signal);
    const identity = privateSnapshotId(source);
    if (identity !== input.snapshotId) throw changed();
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-private-export-"));
    const chapters = [], timingEnds: number[] = [];
    for (const [index, chapter] of source.chapters.entries()) {
      assertActive(signal);
      const bytes = await deps.readObject(chapter.cache.path, PRIVATE_EXPORT_LIMITS.sourceBytes, signal); assertActive(signal);
      if (bytes.length !== chapter.cache.bytes || bytes.length > PRIVATE_EXPORT_LIMITS.sourceBytes || !chapter.cache.path.endsWith(`-${audioObjectHash(bytes, chapter.text)}.${chapter.cache.path.endsWith(".mp3") ? "mp3" : "wav"}`)) throw new PrivateExportError(422, "AUDIO_HASH_MISMATCH", "An existing audio file could not be verified against this edition. No download was published.");
      const sidecar = await deps.readObject(`${chapter.cache.path}.timing.json`, PRIVATE_EXPORT_LIMITS.timingBytes, signal); assertActive(signal);
      let timing = null;
      try { if (sidecar.length <= PRIVATE_EXPORT_LIMITS.timingBytes) timing = parseTimingSidecar(JSON.parse(sidecar.toString("utf8")), { chapterId: chapter.id, bookVersionId: input.editionId, audioPath: chapter.cache.path, sourceText: chapter.text }); } catch { /* Untrusted sidecar fails closed below. */ }
      if (!timing) throw new PrivateExportError(422, "AUDIO_PROVENANCE_UNAVAILABLE", "This chapter lacks verified timing for the current text and audio. No legacy audio was substituted.");
      timingEnds.push(timing.words[timing.words.length - 1].end);
      const filePath = path.join(temporary, `chapter-${index}.audio`); await fs.writeFile(filePath, bytes);
      chapters.push({ id: chapter.id, title: chapter.title, filePath, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    assertActive(signal);
    const result = await (deps.encode ?? exportLocalAudio)({ editionId: input.editionId, format: input.format, metadata: privateExportMetadata(source), expectedChapterIds: chapters.map((chapter) => chapter.id), chapters }, { sourceRoot: temporary, signal });
    assertActive(signal);
    if (result.chapters.length !== chapters.length || result.chapters.some((chapter, index) => chapter.id !== chapters[index].id || timingEnds[index] > (chapter.endSample - chapter.startSample) / 48000 + 0.05)) throw new PrivateExportError(422, "AUDIO_DURATION_MISMATCH", "The exported chapter lengths do not match the verified source timing.");
    const currentOwner = await interruptible(deps.authorize(signal), signal); assertActive(signal);
    if (currentOwner !== ownerId) throw new PrivateExportError(403, "SESSION_CHANGED", "Your session changed during export. Sign in again before downloading.");
    const current = validatePrivateSnapshot(await deps.snapshot(currentOwner, bookId, input.editionId, signal), currentOwner, bookId, input.editionId); assertActive(signal);
    if (privateSnapshotId(current) !== identity) throw changed();
    return result;
  } finally {
    try { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); }
    finally { activeExport = false; }
  }
}
