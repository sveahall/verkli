import { expect, it, vi } from "vitest";
import { uploadChapterAudio } from "./chapter-audio-storage";

const timing = { sourceText: "Hej", words: [{ word: "Hej", start: 0, end: 1, startOffset: 0, endOffset: 3 }] };
const input = { bucket: "private-audio", storagePath: "cache/book/chapter-0123456789abcdef.mp3", audio: Buffer.from("audio"), chapterId: "chapter", bookVersionId: "edition", contentHash: "hash", voiceId: "voice", modelPath: "model", language: "sv", durationSeconds: 1, contentType: "audio/mpeg", timing, smoke: false };
function client(failAt?: number) {
  const calls: string[] = [];
  const upload = vi.fn(async (path: string, _data: unknown) => { void _data; calls.push(path); return { error: calls.length === failAt ? { message: "private error" } : null }; });
  const upsert = vi.fn(async () => { calls.push("cache"); return { error: calls.length === failAt ? { message: "private error" } : null }; });
  const fake = { storage: { from: vi.fn(() => ({ upload })) }, from: vi.fn(() => ({ upsert })) };
  return { db: fake as unknown as Parameters<typeof uploadChapterAudio>[0], calls, upload, upsert };
}
it("publishes an audio/timing pair before making the cache pointer visible", async () => {
  const test = client();
  await uploadChapterAudio(test.db, input);
  expect(test.calls).toEqual([input.storagePath, `${input.storagePath}.timing.json`, "cache"]);
  expect(JSON.parse(String(test.upload.mock.calls[1][1]))).toMatchObject({ version: 1, chapterId: input.chapterId, bookVersionId: input.bookVersionId, audioPath: input.storagePath, timing });
});
it.each([1, 2, 3])("reports persistence failure %s without successful publication", async (failAt) => {
  const test = client(failAt);
  await expect(uploadChapterAudio(test.db, input)).rejects.toThrow("[audiobook worker]");
  expect(test.calls).toHaveLength(failAt);
});
it("does not publish smoke audio/timing into the reusable cache", async () => {
  const test = client();
  await uploadChapterAudio(test.db, { ...input, smoke: true });
  expect(test.calls).toEqual([input.storagePath]);
});
it("supports honest audio-only provider responses", async () => {
  const test = client();
  await uploadChapterAudio(test.db, { ...input, timing: null });
  expect(test.calls).toEqual([input.storagePath, "cache"]);
});
