import { expect, it } from "vitest";
import { audioObjectHash, parseTimingSidecar } from "./timing-storage";
const identity = { chapterId: "chapter", bookVersionId: "edition", audioPath: "cache/book/chapter-0123456789abcdef.mp3", sourceText: "Hej" };
const sidecar = { version: 1, ...identity, timing: { sourceText: "Hej", words: [{ word: "Hej", start: 0, end: 1, startOffset: 0, endOffset: 3 }] } };
it("binds timing to exact file, chapter, edition and text", () => {
  expect(parseTimingSidecar(sidecar, identity)).toEqual(sidecar.timing);
  for (const key of ["audioPath", "chapterId", "bookVersionId", "sourceText"]) {
    expect(parseTimingSidecar(sidecar, { ...identity, [key]: "changed" })).toBeNull();
  }
  expect(parseTimingSidecar({ ...sidecar, version: 2 }, identity)).toBeNull();
});
it("isolates regenerated audio and exact text even if normalized text/cache key is equal", () => {
  expect(audioObjectHash(Buffer.from("voice A"), "Hej")).not.toBe(audioObjectHash(Buffer.from("voice B"), "Hej"));
  expect(audioObjectHash(Buffer.from("voice A"), "Hej")).not.toBe(audioObjectHash(Buffer.from("voice A"), " Hej"));
});
