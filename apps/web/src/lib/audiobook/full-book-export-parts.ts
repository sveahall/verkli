import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { exportFormatSchema, exportProfile } from "./export-contract";

// Bound the durable cleanup ledger even when a bucket requires very small objects.
export const FULL_BOOK_EXPORT_PART_LIMITS = Object.freeze({ maxOutputBytes: 4 * 1024 ** 3, maxPartBytes: 64 * 1024 ** 2, maxParts: 4096 });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z.object({
  ownerId: z.string().uuid(), bookId: z.string().uuid(), editionId: z.string().uuid(), jobId: z.string().uuid(), attemptId: z.string().uuid(), snapshotId: sha256Schema, format: exportFormatSchema,
}).strict();
const metadataSchema = z.object({
  identity: identitySchema, byteLength: z.number().int().min(1).max(FULL_BOOK_EXPORT_PART_LIMITS.maxOutputBytes), sha256: sha256Schema,
  durationSeconds: z.number().finite().positive(), chapterCount: z.number().int().min(1).max(500),
}).strict();
const partSchema = z.object({
  index: z.number().int().min(0).max(FULL_BOOK_EXPORT_PART_LIMITS.maxParts - 1),
  offset: z.number().int().min(0).max(FULL_BOOK_EXPORT_PART_LIMITS.maxOutputBytes - 1),
  byteLength: z.number().int().min(1).max(FULL_BOOK_EXPORT_PART_LIMITS.maxPartBytes), sha256: sha256Schema, path: z.string().max(300),
}).strict();
const manifestSchema = identitySchema.extend({
  version: z.literal(2), contentType: z.enum(["audio/mp4", "audio/mpeg"]),
  byteLength: metadataSchema.shape.byteLength, sha256: sha256Schema, durationSeconds: metadataSchema.shape.durationSeconds, chapterCount: metadataSchema.shape.chapterCount,
  parts: z.array(partSchema).min(1).max(FULL_BOOK_EXPORT_PART_LIMITS.maxParts),
}).strict();
export type ExportPartIdentity = Readonly<z.infer<typeof identitySchema>>;
export type ExportPart = Readonly<z.infer<typeof partSchema>>;
export type ExportPartManifest = Readonly<Omit<z.infer<typeof manifestSchema>, "parts"> & { parts: readonly ExportPart[] }>;
export type ExportPartMetadata = Readonly<Omit<z.infer<typeof metadataSchema>, "identity"> & { identity: ExportPartIdentity }>;

function checkPartBytes(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > FULL_BOOK_EXPORT_PART_LIMITS.maxPartBytes) throw new Error("[audiobook export parts] Part size must be a positive integer at most 64 MiB.");
}
function partPath(identity: ExportPartIdentity, index: number) {
  return `exports/${identity.ownerId}/${identity.bookId}/${identity.editionId}/${identity.jobId}/${identity.attemptId}/part-${String(index).padStart(5, "0")}.bin`;
}
export function exportPartPath(identity: ExportPartIdentity, index: number) {
  return partPath(identitySchema.parse(identity), partSchema.shape.index.parse(index));
}

/** Parse untrusted storage data against the exact owner, job, attempt, snapshot and format. */
export function validateExportPartManifest(value: unknown, expected: ExportPartIdentity, partBytes: number = FULL_BOOK_EXPORT_PART_LIMITS.maxPartBytes): ExportPartManifest {
  checkPartBytes(partBytes);
  const trusted = identitySchema.parse(expected), manifest = manifestSchema.parse(value);
  for (const key of Object.keys(trusted) as (keyof ExportPartIdentity)[]) {
    if (manifest[key] !== trusted[key]) throw new Error(`[audiobook export parts] Manifest ${key} does not match this export.`);
  }
  if (manifest.contentType !== exportProfile(manifest.format).contentType) throw new Error("[audiobook export parts] Manifest content type does not match the export format.");
  let offset = 0;
  for (const [index, part] of manifest.parts.entries()) {
    if (part.index !== index || part.offset !== offset || part.path !== partPath(trusted, index) || part.byteLength > partBytes) throw new Error("[audiobook export parts] Manifest parts must be canonical, ordered, contiguous and within the bucket limit.");
    offset += part.byteLength;
    if (offset > manifest.byteLength) throw new Error("[audiobook export parts] Manifest parts exceed the declared export size.");
    Object.freeze(part);
  }
  if (offset !== manifest.byteLength) throw new Error("[audiobook export parts] Manifest parts do not cover the complete export.");
  Object.freeze(manifest.parts);
  return Object.freeze(manifest);
}

export function buildExportPartManifest(input: ExportPartMetadata, parts: readonly ExportPart[], partBytes: number = FULL_BOOK_EXPORT_PART_LIMITS.maxPartBytes): ExportPartManifest {
  const { identity, ...metadata } = metadataSchema.parse(input);
  return validateExportPartManifest({ version: 2, ...identity, ...metadata, contentType: exportProfile(identity.format).contentType, parts }, identity, partBytes);
}

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("[audiobook export parts] Export part staging was cancelled.", { cause: signal.reason });
}

/** Uses one 64 KiB buffer and private, disk-backed files. Caller owns cleanup after upload. */
export async function stageExportParts(input: ExportPartMetadata & { filePath: string; sourceRoot: string }, options: { outputRoot: string; partBytes: number; signal?: AbortSignal }) {
  const metadata = metadataSchema.parse({ identity: input.identity, byteLength: input.byteLength, sha256: input.sha256, durationSeconds: input.durationSeconds, chapterCount: input.chapterCount });
  checkPartBytes(options.partBytes);
  if (Math.ceil(metadata.byteLength / options.partBytes) > FULL_BOOK_EXPORT_PART_LIMITS.maxParts) throw new Error("[audiobook export parts] Export requires more than 4096 parts. Increase the part size.");
  const signal = options.signal;
  let sourceHandle: FileHandle | undefined, partHandle: FileHandle | undefined, ownedDirectory: string | undefined, keepResult = false;
  try {
    cancelled(signal);
    const root = await fs.realpath(input.sourceRoot), source = await fs.realpath(input.filePath);
    if (!source.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) throw new Error("[audiobook export parts] Encoded source is outside the export workspace.");
    const before = await fs.stat(source);
    if (!before.isFile()) throw new Error("[audiobook export parts] Encoded source must be a regular file.");
    if (before.size !== metadata.byteLength) throw new Error("[audiobook export parts] Encoded source size does not match the verified export.");
    sourceHandle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await sourceHandle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || await fs.realpath(input.filePath) !== source) throw new Error("[audiobook export parts] Encoded source changed before staging.");
    cancelled(signal);
    await fs.mkdir(options.outputRoot, { recursive: true });
    ownedDirectory = await fs.mkdtemp(path.join(await fs.realpath(options.outputRoot), "verkli-export-parts-"));
    const directory = ownedDirectory, files: Array<{ part: ExportPart; filePath: string }> = [];
    const buffer = Buffer.allocUnsafe(64 * 1024), fullHash = createHash("sha256");
    let offset = 0;
    while (offset < metadata.byteLength) {
      cancelled(signal);
      const index = files.length, length = Math.min(options.partBytes, metadata.byteLength - offset), partHash = createHash("sha256");
      const filePath = path.join(directory, `part-${String(index).padStart(5, "0")}.bin`);
      partHandle = await fs.open(filePath, "wx", 0o600);
      let copied = 0;
      while (copied < length) {
        cancelled(signal);
        const { bytesRead } = await sourceHandle.read(buffer, 0, Math.min(buffer.length, length - copied), offset + copied);
        cancelled(signal);
        if (!bytesRead) throw new Error("[audiobook export parts] Encoded source ended before its declared size.");
        const chunk = buffer.subarray(0, bytesRead);
        fullHash.update(chunk); partHash.update(chunk);
        let written = 0;
        while (written < bytesRead) {
          cancelled(signal);
          const { bytesWritten } = await partHandle.write(chunk, written, bytesRead - written, null);
          cancelled(signal);
          if (!bytesWritten) throw new Error("[audiobook export parts] Could not write the complete export part.");
          written += bytesWritten;
        }
        copied += bytesRead;
      }
      await partHandle.close(); partHandle = undefined;
      files.push({ part: { index, offset, byteLength: copied, sha256: partHash.digest("hex"), path: partPath(metadata.identity, index) }, filePath });
      offset += copied;
    }
    cancelled(signal);
    const extra = await sourceHandle.read(buffer, 0, 1, offset), after = await sourceHandle.stat();
    if (extra.bytesRead || after.size !== metadata.byteLength || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || await fs.realpath(input.filePath) !== source || fullHash.digest("hex") !== metadata.sha256) throw new Error("[audiobook export parts] Encoded source size or SHA-256 changed during staging.");
    const manifest = buildExportPartManifest(metadata, files.map(({ part }) => part), options.partBytes);
    await sourceHandle.close(); sourceHandle = undefined;
    cancelled(signal);
    keepResult = true;
    return { manifest, files: files.map(({ filePath }, index) => ({ part: manifest.parts[index], filePath })), cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
  } finally {
    try { await partHandle?.close(); }
    finally {
      try { await sourceHandle?.close(); }
      finally { if (ownedDirectory && !keepResult) await fs.rm(ownedDirectory, { recursive: true, force: true }); }
    }
  }
}
