import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { exportPrivateAudio, loadPrivateExportPreview, type PrivateExportDependencies } from "./private-export-service";
import { privateContentHash, privateSnapshotId } from "./private-export-contract";
import type { exportLocalAudio } from "./export-local";
import { audioObjectHash } from "./timing-storage";
const ownerId = "00000000-0000-4000-8000-000000000001", bookId = "00000000-0000-4000-8000-000000000002", editionId = "00000000-0000-4000-8000-000000000003", chapterId = "00000000-0000-4000-8000-000000000004";
function setup() {
  const audio = Buffer.from("synthetic-audio-only"), text = "Synthetic", path = `cache/${bookId}/${chapterId}-${audioObjectHash(audio, text)}.wav`;
  const source = { ownerId, book: { id: bookId, authorId: ownerId, title: "Synthetic", deletedAt: null, demoRunId: null }, edition: { id: editionId, bookId, language: "en", demoRunId: null }, authorName: "Demo author", asset: { id: "00000000-0000-4000-8000-000000000005", bookId, language: "en", status: "generated", isSmoke: false, demoRunId: null }, chapterCount: 1, chapters: [{ id: chapterId, bookId, editionId, order: 0, title: "One", text, cache: { id: "00000000-0000-4000-8000-000000000006", chapterId, editionId, contentHash: privateContentHash(text, chapterId, editionId), voiceId: "voice", modelId: "model", language: "en", path, bytes: audio.length } }] };
  const timing = Buffer.from(JSON.stringify({ version: 1, chapterId, bookVersionId: editionId, audioPath: path, timing: { sourceText: text, words: [{ word: text, start: 0, end: 1, startOffset: 0, endOffset: text.length }] } }));
  let temp = "";
  const encode = vi.fn(async (_input: unknown, options: Parameters<typeof exportLocalAudio>[1]) => { temp = options.sourceRoot; expect(await fs.readFile(`${temp}/chapter-0.audio`)).toEqual(audio); return { audio: Buffer.from("verified-output"), format: "m4b", contentType: "audio/mp4", extension: "m4b", durationSeconds: 2, chapters: [{ id: chapterId, title: "One", startSample: 0, endSample: 96000 }], sha256: createHash("sha256").update("verified-output").digest("hex"), probe: {}, verifiedPcm: Buffer.alloc(0) }; });
  const deps = { authorize: vi.fn(async () => ownerId), snapshot: vi.fn(async () => structuredClone(source)), readObject: vi.fn(async (key: string) => key.endsWith(".timing.json") ? timing : audio), encode, rateLimit: vi.fn(async () => true) } as unknown as PrivateExportDependencies;
  return { deps, source, audio, timing, encode, temp: () => temp, input: { editionId, format: "m4b" as const, snapshotId: privateSnapshotId(source) } };
}
describe("private existing-audio export service", () => {
  it("authorizes preview without reading private audio", async () => { const env = setup(); expect((await loadPrivateExportPreview(env.deps, bookId, editionId, new AbortController().signal)).snapshotId).toBe(env.input.snapshotId); expect(env.deps.readObject).not.toHaveBeenCalled(); });
  it("freezes verified bytes, rechecks session/snapshot and removes all temporary files", async () => {
    const env = setup(); const result = await exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal);
    expect(result.audio.toString()).toBe("verified-output"); expect(env.deps.authorize).toHaveBeenCalledTimes(2); expect(env.deps.snapshot).toHaveBeenCalledTimes(2);
    await expect(fs.stat(env.temp())).rejects.toThrow();
  });
  it("rejects stale client snapshot before downloading", async () => { const env = setup(); await expect(exportPrivateAudio(env.deps, bookId, { ...env.input, snapshotId: "0".repeat(64) }, new AbortController().signal)).rejects.toThrow("changed"); expect(env.deps.readObject).not.toHaveBeenCalled(); });
  it.each(["bytes", "timing", "oversized"])("rejects %s corruption without encoding", async (scenario) => {
    const env = setup(); vi.mocked(env.deps.readObject).mockImplementation(async (key) => scenario === "oversized" ? Buffer.alloc(21 * 1024 * 1024) : scenario === "bytes" && !key.endsWith("json") ? Buffer.from("tampered") : Buffer.from("{}"));
    await expect(exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal)).rejects.toThrow(); expect(env.encode).not.toHaveBeenCalled();
  });
  it("discards output when chapters change during encoding", async () => {
    const env = setup(); vi.mocked(env.deps.snapshot).mockResolvedValueOnce(env.source).mockResolvedValueOnce({ ...env.source, book: { ...env.source.book, title: "Changed" } });
    await expect(exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal)).rejects.toThrow("changed"); await expect(fs.stat(env.temp())).rejects.toThrow();
  });
  it("discards output when session ownership changes", async () => {
    const env = setup(); vi.mocked(env.deps.authorize).mockResolvedValueOnce(ownerId).mockResolvedValueOnce("other-owner");
    await expect(exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal)).rejects.toThrow("session"); await expect(fs.stat(env.temp())).rejects.toThrow();
  });
  it("checks cancellation before work and after storage reads", async () => {
    const env = setup(), controller = new AbortController(); controller.abort();
    await expect(exportPrivateAudio(env.deps, bookId, env.input, controller.signal)).rejects.toThrow(); expect(env.deps.authorize).not.toHaveBeenCalled();
    const second = new AbortController(); vi.mocked(env.deps.readObject).mockImplementation(async () => { second.abort(); return env.audio; });
    await expect(exportPrivateAudio(env.deps, bookId, env.input, second.signal)).rejects.toThrow(); expect(env.encode).not.toHaveBeenCalled();
  });
  it("rejects rate limited requests without private reads", async () => { const env = setup(); vi.mocked(env.deps.rateLimit!).mockResolvedValue(false); await expect(exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal)).rejects.toThrow("wait"); expect(env.deps.readObject).not.toHaveBeenCalled(); });
  it.each(["authorize", "rateLimit"] as const)("releases the export slot when cancellation interrupts stalled %s", async (step) => {
    const env = setup(), controller = new AbortController();
    vi.mocked(env.deps[step]!).mockImplementationOnce(() => new Promise<never>(() => {}));
    const pending = exportPrivateAudio(env.deps, bookId, env.input, controller.signal);
    const assertion = expect(pending).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(env.deps[step]).toHaveBeenCalled()); controller.abort(); await assertion;
    expect(env.encode).not.toHaveBeenCalled();
    expect((await exportPrivateAudio(env.deps, bookId, env.input, new AbortController().signal)).audio.toString()).toBe("verified-output");
  });
});
