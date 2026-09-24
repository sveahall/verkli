import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExportPartManifest, exportPartPath, FULL_BOOK_EXPORT_PART_LIMITS, stageExportParts, validateExportPartManifest, type ExportPartIdentity } from "./full-book-export-parts";

const identity: ExportPartIdentity = {
  ownerId: "11111111-1111-4111-8111-111111111111", bookId: "22222222-2222-4222-8222-222222222222",
  editionId: "33333333-3333-4333-8333-333333333333", jobId: "44444444-4444-4444-8444-444444444444",
  attemptId: "55555555-5555-4555-8555-555555555555", snapshotId: "a".repeat(64), format: "mp3-128",
};
const bytes = Buffer.from("0123456789abcdefg"), hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const metadata = { identity, byteLength: bytes.length, sha256: hash(bytes), durationSeconds: 3.25, chapterCount: 2 };
function manifest() {
  return buildExportPartManifest(metadata, [0, 5, 10, 15].map((offset, index) => ({ index, offset, byteLength: Math.min(5, bytes.length - offset), sha256: hash(bytes.subarray(offset, offset + 5)), path: exportPartPath(identity, index) })), 5);
}
async function fixture() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "verkli-parts-test-")));
  const sourceRoot = path.join(directory, "source"), outputRoot = path.join(directory, "output");
  await fs.mkdir(sourceRoot); await fs.mkdir(outputRoot);
  const filePath = path.join(sourceRoot, "book.mp3"); await fs.writeFile(filePath, bytes);
  return { directory, sourceRoot, outputRoot, filePath, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}
afterEach(() => vi.restoreAllMocks());

describe("version 2 private export manifest", () => {
  it("binds a canonical immutable manifest to all identity fields and the selected profile", () => {
    const value = manifest();
    expect(validateExportPartManifest(value, identity, 5)).toEqual(value);
    expect(value.version).toBe(2); expect(value.contentType).toBe("audio/mpeg");
    expect(value.parts[0].path).toBe(`exports/${identity.ownerId}/${identity.bookId}/${identity.editionId}/${identity.jobId}/${identity.attemptId}/part-00000.bin`);
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.parts[0])).toBe(true);
    expect(FULL_BOOK_EXPORT_PART_LIMITS).toEqual({ maxOutputBytes: 4 * 1024 ** 3, maxPartBytes: 64 * 1024 ** 2, maxParts: 4096 });
  });
  it.each([
    ["version", 1], ["ownerId", "not-a-uuid"], ["snapshotId", "a"], ["sha256", "g".repeat(64)], ["byteLength", 0],
    ["byteLength", 4 * 1024 ** 3 + 1], ["byteLength", Number.MAX_SAFE_INTEGER + 1], ["byteLength", 17.5],
    ["durationSeconds", Infinity], ["durationSeconds", 0], ["chapterCount", 501], ["chapterCount", 0],
    ["contentType", "audio/mp4"], ["format", "wav"], ["extra", true],
  ])("rejects invalid top-level %s (%s)", (key, value) => {
    expect(() => validateExportPartManifest({ ...manifest(), [key]: value }, identity, 5)).toThrow();
  });
  it.each(["ownerId", "bookId", "editionId", "jobId", "attemptId", "snapshotId", "format"] as const)("rejects a foreign %s", (key) => {
    const expected: ExportPartIdentity = { ...identity, [key]: key === "format" ? "m4b" : key === "snapshotId" ? "b".repeat(64) : "99999999-9999-4999-8999-999999999999" };
    expect(() => validateExportPartManifest(manifest(), expected, 5)).toThrow();
  });
  it.each(["gap", "overlap", "duplicate", "reorder", "missing", "foreign path", "extra", "oversized", "zero", "bad hash", "too many"])("rejects %s parts", (scenario) => {
    const original = manifest(), value = { ...original, parts: original.parts.map((part) => ({ ...part })) };
    if (scenario === "gap") value.parts[1].offset++;
    if (scenario === "overlap") value.parts[1].offset--;
    if (scenario === "duplicate") value.parts[1] = { ...value.parts[0] };
    if (scenario === "reorder") value.parts.reverse();
    if (scenario === "missing") value.parts.pop();
    if (scenario === "foreign path") value.parts[0].path = value.parts[0].path.replace(identity.attemptId, identity.bookId);
    if (scenario === "extra") Object.assign(value.parts[0], { extra: true });
    if (scenario === "oversized") value.parts[0].byteLength = 64 * 1024 ** 2 + 1;
    if (scenario === "zero") value.parts[0].byteLength = 0;
    if (scenario === "bad hash") value.parts[0].sha256 = "not-a-hash";
    if (scenario === "too many") value.parts = Array.from({ length: 4097 }, () => value.parts[0]);
    expect(() => validateExportPartManifest(value, identity, 5)).toThrow();
  });
  it("accepts a 4 GiB manifest without allocating audio and binds the M4B content type", () => {
    const byteLength = 4 * 1024 ** 3, partBytes = 64 * 1024 ** 2, m4bIdentity = { ...identity, format: "m4b" as const };
    const parts = Array.from({ length: 64 }, (_, index) => ({ index, offset: index * partBytes, byteLength: partBytes, sha256: metadata.sha256, path: exportPartPath(m4bIdentity, index) }));
    const value = buildExportPartManifest({ ...metadata, identity: m4bIdentity, byteLength }, parts);
    expect(value.byteLength).toBe(byteLength); expect(value.contentType).toBe("audio/mp4");
  });
  it("applies the supplied bucket part limit and rejects invalid limits", () => {
    expect(() => validateExportPartManifest(manifest(), identity, 4)).toThrow();
    for (const limit of [0, -1, Infinity, 1.2, 64 * 1024 ** 2 + 1]) expect(() => validateExportPartManifest(manifest(), identity, limit)).toThrow();
    for (const index of [-1, 0.1, 4096, Infinity]) expect(() => exportPartPath(identity, index)).toThrow();
  });
});

describe("disk-backed export part staging", () => {
  it("splits 17 bytes sequentially, reconstructs exact bytes and hashes, and cleans idempotently", async () => {
    const f = await fixture();
    try {
      const result = await stageExportParts({ ...metadata, ...f }, { outputRoot: f.outputRoot, partBytes: 5 });
      expect(result.manifest).toEqual(manifest());
      const contents = await Promise.all(result.files.map(async ({ part, filePath }) => {
        const content = await fs.readFile(filePath); expect(hash(content)).toBe(part.sha256); expect(content.length).toBe(part.byteLength);
        expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600); return content;
      }));
      expect(Buffer.concat(contents)).toEqual(bytes); expect(hash(Buffer.concat(contents))).toBe(metadata.sha256);
      await result.cleanup(); await result.cleanup(); expect(await fs.readdir(f.outputRoot)).toEqual([]);
      expect(await fs.readFile(f.filePath)).toEqual(bytes);
    } finally { await f.cleanup(); }
  });
  it.each(["hash", "length", "empty", "outside", "outside symlink", "directory", "aborted", "too many parts", "zero part bytes"])("rejects %s and removes staged output", async (scenario) => {
    const f = await fixture();
    try {
      const input = { ...metadata, filePath: f.filePath, sourceRoot: f.sourceRoot }, controller = new AbortController();
      let partBytes = 5;
      if (scenario === "hash") input.sha256 = "0".repeat(64);
      if (scenario === "length") input.byteLength++;
      if (scenario === "empty") await fs.writeFile(f.filePath, "");
      if (scenario === "outside" || scenario === "outside symlink") {
        const outside = path.join(f.directory, "outside.mp3"); await fs.writeFile(outside, bytes);
        if (scenario === "outside") input.filePath = outside;
        else { await fs.unlink(f.filePath); await fs.symlink(outside, f.filePath); }
      }
      if (scenario === "directory") input.filePath = f.sourceRoot;
      if (scenario === "aborted") controller.abort();
      if (scenario === "too many parts") { input.byteLength = 4097; partBytes = 1; }
      if (scenario === "zero part bytes") partBytes = 0;
      await expect(stageExportParts(input, { outputRoot: f.outputRoot, partBytes, signal: controller.signal })).rejects.toThrow();
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it("cleans a cancellation after an output part has been opened", async () => {
    const f = await fixture(), controller = new AbortController(), originalOpen = fs.open.bind(fs);
    try {
      vi.spyOn(fs, "open").mockImplementation(async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).startsWith(f.outputRoot)) controller.abort();
        return handle;
      });
      await expect(stageExportParts({ ...metadata, ...f }, { outputRoot: f.outputRoot, partBytes: 5, signal: controller.signal })).rejects.toThrow();
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it.each(["truncate", "grow", "same-size change", "zero write", "abort during write"])("cleans staged files on %s during copying", async (scenario) => {
    const f = await fixture(), originalOpen = fs.open.bind(fs), controller = new AbortController();
    let injected = false;
    try {
      vi.spyOn(fs, "open").mockImplementation(async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).startsWith(f.outputRoot)) {
          const write = handle.write.bind(handle);
          handle.write = (async (buffer: Buffer, offset: number, length: number, position: number | null) => {
            if (!injected) {
              injected = true;
              if (scenario === "truncate") await fs.truncate(f.filePath, 5);
              if (scenario === "grow") await fs.appendFile(f.filePath, "x");
              if (scenario === "same-size change") await fs.writeFile(f.filePath, "x".repeat(bytes.length));
              if (scenario === "zero write") return { bytesWritten: 0, buffer };
              if (scenario === "abort during write") controller.abort();
            }
            return write(buffer, offset, length, position);
          }) as typeof handle.write;
        }
        return handle;
      });
      await expect(stageExportParts({ ...metadata, ...f }, { outputRoot: f.outputRoot, partBytes: 5, signal: controller.signal })).rejects.toThrow();
      expect(injected).toBe(true); expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it("handles partial writes without losing bytes", async () => {
    const f = await fixture(), originalOpen = fs.open.bind(fs);
    try {
      vi.spyOn(fs, "open").mockImplementation(async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]).startsWith(f.outputRoot)) {
          const write = handle.write.bind(handle);
          handle.write = ((buffer: Buffer, offset: number, length: number, position: number | null) => write(buffer, offset, Math.min(2, length), position)) as typeof handle.write;
        }
        return handle;
      });
      const result = await stageExportParts({ ...metadata, ...f }, { outputRoot: f.outputRoot, partBytes: 5 });
      expect(Buffer.concat(await Promise.all(result.files.map(({ filePath }) => fs.readFile(filePath))))).toEqual(bytes);
      await result.cleanup();
    } finally { await f.cleanup(); }
  });
});
