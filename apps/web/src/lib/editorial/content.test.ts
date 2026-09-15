import { describe, expect, it } from "vitest";
import { applyCorrection, reviewText, splitReviewText } from "./content";
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
describe("editorial corrections", () => {
  it("preserves formatting and images when replacing adjacent marked text", () => {
    const input = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A mis", marks: [{ type: "bold" }] }, { type: "text", text: "take here." }] }, { type: "image", attrs: { src: "/cover.png" } }] };
    expect(reviewText(JSON.stringify(input))).toBe("A mistake here.");
    const changed = applyCorrection(JSON.stringify(input), "mistake", "correction");
    expect(reviewText(JSON.stringify(changed))).toBe("A correction here.");
    expect(changed.content?.[0].content?.[0].marks).toEqual([{ type: "bold" }]);
    expect(changed.content?.[1]).toEqual(input.content[1]);
  });
  it("rejects missing and ambiguous quotations", () => {
    expect(() => applyCorrection(doc("word word"), "word", "new")).toThrow("more than once");
    expect(() => applyCorrection(doc("changed"), "old", "new")).toThrow("no longer");
  });
  it("rejects cross-paragraph edits rather than merging paragraphs", () => {
    const input = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }, { type: "paragraph", content: [{ type: "text", text: "two" }] }] });
    expect(() => applyCorrection(input, "one\n\ntwo", "merged")).toThrow("single paragraph");
  });
  it("supports deletion without empty text nodes", () => {
    expect(applyCorrection(doc("extra"), "extra", "").content?.[0].content).toEqual([]);
  });
  it("preserves every character when chunking a long chapter", () => {
    const input = "abcdef\n\n".repeat(5000);
    const chunks = splitReviewText(input);
    expect(chunks.join("")).toBe(input);
    expect(chunks.every((chunk) => chunk.length <= 12000)).toBe(true);
  });
  it("keeps supplementary Unicode characters intact at a hard chunk boundary", () => {
    const input = "a".repeat(11999) + "😀end";
    const chunks = splitReviewText(input);
    expect(chunks.join("")).toBe(input);
    expect(chunks[0]).toBe("a".repeat(11999));
    expect(chunks[1]).toBe("😀end");
    const corrected = applyCorrection(doc(input), chunks[1], "😀finish");
    expect(reviewText(JSON.stringify(corrected))).toBe("a".repeat(11999) + "😀finish");
  });
  it("does not treat legacy HTML as safely editable rich text", () => {
    expect(() => applyCorrection("<p>text</p>", "text", "new")).toThrow("Open and save");
  });
});
