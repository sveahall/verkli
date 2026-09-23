import { describe, expect, it } from "vitest";
import { splitBookAnalysis } from "./book-analysis-content";

const chapter = { id: "one", title: "One", order: 0, text: "A beginning." };
describe("whole-book analysis content", () => {
  it("preserves every character, chapter identity and part order without splitting Unicode", () => {
    const text = "a".repeat(11999) + "🦋" + "語".repeat(16000);
    const parts = splitBookAnalysis([{ ...chapter, text }, { ...chapter, id: "two", order: 1, text: "The end." }]);
    expect(parts.filter((part) => part.chapterId === "one").map((part) => part.text).join("")).toBe(text);
    expect(parts.map((part) => part.partIndex)).toEqual([0, 1, 2, 0]);
    expect(parts[0]).toMatchObject({ chapterTitle: "One", chapterOrder: 0 });
    expect(parts[0].text.endsWith("\ud83e")).toBe(false);
    expect(parts.at(-1)?.text).toBe("The end.");
  });
  it("rejects oversized books instead of silently excerpting", () => {
    expect(() => splitBookAnalysis([{ ...chapter, text: "a".repeat(600001) }])).toThrow(/600,000/);
    expect(() => splitBookAnalysis(Array.from({ length: 101 }, (_, index) => ({ ...chapter, id: String(index) })))).toThrow(/100/);
    const tooManyParts = Array.from({ length: 100 }, (_, index) => ({ ...chapter, id: String(index), text: index === 0 ? "a".repeat(24001) : "short" }));
    expect(() => splitBookAnalysis(tooManyParts)).toThrow(/100 parts/);
  });
  it("rejects duplicate chapter identities and empty manuscripts", () => {
    expect(() => splitBookAnalysis([chapter, chapter])).toThrow(/unique/);
    expect(() => splitBookAnalysis([{ ...chapter, text: "" }])).toThrow(/text/);
  });
});
