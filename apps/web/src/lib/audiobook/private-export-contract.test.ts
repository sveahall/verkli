import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validatePrivateSnapshot, privateSnapshotId, privateExportRequestSchema, privateContentHash } from "./private-export-contract";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function snapshotFixture() {
  const text = "A synthetic chapter.", chapterId = id(4), editionId = id(3);
  return { ownerId: id(1), book: { id: id(2), authorId: id(1), title: "Synthetic book", deletedAt: null, demoRunId: null }, edition: { id: editionId, bookId: id(2), language: "en", demoRunId: null }, authorName: "Demo author", asset: { id: id(5), bookId: id(2), language: "en", status: "generated", isSmoke: false, demoRunId: null }, chapterCount: 1, chapters: [{ id: chapterId, bookId: id(2), editionId, order: 0, title: "Chapter one", text, cache: { id: id(6), chapterId, editionId, contentHash: createHash("sha256").update(`${text}|${chapterId}|${editionId}`).digest("hex"), voiceId: "voice", modelId: "model", language: "en", path: `cache/${id(2)}/${chapterId}-0123456789abcdef.wav`, bytes: 100 } }] };
}
describe("private export snapshot boundary", () => {
  it("accepts a larger book only with explicit server limits, keeping E2 defaults unchanged", () => {
    const source = snapshotFixture();
    source.chapters = Array.from({ length: 21 }, (_, index) => {
      const chapter = structuredClone(source.chapters[0]);
      chapter.id = id(100 + index); chapter.order = index; chapter.cache.id = id(200 + index); chapter.cache.chapterId = chapter.id;
      chapter.cache.contentHash = privateContentHash(chapter.text, chapter.id, chapter.editionId);
      chapter.cache.path = `cache/${id(2)}/${chapter.id}-0123456789abcdef.wav`;
      return chapter;
    });
    source.chapterCount = source.chapters.length;
    const limits = { chapters: 500, sourceBytes: 134217728, totalSourceBytes: 2147483648, timingBytes: 2097152, deadlineMs: 3600000 };
    expect(() => validatePrivateSnapshot(source, id(1), id(2), id(3))).toThrow();
    expect(validatePrivateSnapshot(source, id(1), id(2), id(3), limits)).toEqual(source);
    expect(privateSnapshotId(source, limits)).toMatch(/^[a-f0-9]{64}$/);
    source.chapters[20].cache.voiceId = "different";
    expect(() => validatePrivateSnapshot(source, id(1), id(2), id(3), limits)).toThrow();
  });

  it("accepts a complete matching server snapshot and creates a stable identity", () => { const source = snapshotFixture(); expect(validatePrivateSnapshot(source, id(1), id(2), id(3))).toEqual(source); expect(privateSnapshotId(source)).toMatch(/^[a-f0-9]{64}$/); });
  it.each(["owner", "book", "edition", "count", "smoke", "demo", "path", "hash", "cache-edition", "deleted"])("rejects %s mismatches before any storage read", (scenario) => {
    const source = snapshotFixture();
    if (scenario === "owner") source.book.authorId = id(9);
    if (scenario === "book") source.chapters[0].bookId = id(9);
    if (scenario === "edition") source.chapters[0].editionId = id(9);
    if (scenario === "count") source.chapterCount = 2;
    if (scenario === "smoke") source.asset.isSmoke = true;
    if (scenario === "demo") Object.assign(source.edition, { demoRunId: id(9) });
    if (scenario === "path") source.chapters[0].cache.path = "https://example.org/private.wav";
    if (scenario === "hash") source.chapters[0].cache.contentHash = "0".repeat(64);
    if (scenario === "cache-edition") source.chapters[0].cache.editionId = id(9);
    if (scenario === "deleted") Object.assign(source.book, { deletedAt: "2026-09-23" });
    expect(() => validatePrivateSnapshot(source, id(1), id(2), id(3))).toThrow();
  });
  it("rejects unexpected client owner/path inputs", () => { expect(privateExportRequestSchema.safeParse({ editionId: id(3), format: "m4b", snapshotId: "a".repeat(64), ownerId: id(1) }).success).toBe(false); });
  it("changes identity when metadata, order or cache selection changes", () => { const source = snapshotFixture(), before = privateSnapshotId(source); source.chapters[0].title = "Changed"; expect(privateSnapshotId(source)).not.toBe(before); });
  it.each(["duplicate-order", "mixed-voice", "mixed-model"])("rejects %s across an otherwise complete edition", (scenario) => {
    const source = snapshotFixture(), second = structuredClone(source.chapters[0]);
    second.id = id(7); second.order = scenario === "duplicate-order" ? 0 : 1; second.cache.id = id(8); second.cache.chapterId = second.id;
    second.cache.contentHash = createHash("sha256").update(`${second.text}|${second.id}|${second.editionId}`).digest("hex");
    second.cache.path = `cache/${id(2)}/${second.id}-0123456789abcdef.wav`;
    if (scenario === "mixed-voice") second.cache.voiceId = "different-voice";
    if (scenario === "mixed-model") second.cache.modelId = "different-model";
    source.chapterCount = 2; source.chapters.push(second);
    expect(() => validatePrivateSnapshot(source, id(1), id(2), id(3))).toThrow();
  });
});
