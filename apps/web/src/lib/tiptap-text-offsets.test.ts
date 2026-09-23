import { describe, expect, it } from "vitest";
import { chapterSchema } from "./tiptap-schema";
import { findTextMatches, mapTextBlocks } from "./tiptap-text-offsets";

const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: ReturnType<typeof text>[]) => ({ type: "paragraph", content });
const doc = (content: unknown[]) => chapterSchema.nodeFromJSON({ type: "doc", content });
const found = (node: ReturnType<typeof doc>, matches: { from: number; to: number }[]) =>
  matches.map(({ from, to }) => node.textBetween(from, to));

describe("findTextMatches", () => {
  it("returns ranges that read back as the query across blocks and marks", () => {
    const node = doc([
      { type: "heading", attrs: { level: 2 }, content: [text("Hamnen")] },
      paragraph(text("En "), text("Fär", [{ type: "bold" }]), text("jan kom.")),
      paragraph(text("Vid landgången. Färjan väntade.")),
    ]);
    const matches = findTextMatches(node, "Färjan");
    expect(found(node, matches)).toEqual(["Färjan", "Färjan"]);
  });

  it("never matches across a hard break or an inline image", () => {
    const node = doc([
      { type: "paragraph", content: [text("Fär"), { type: "hardBreak" }, text("jan")] },
      { type: "paragraph", content: [text("Fär"), { type: "image", attrs: { src: "https://example.test/a.png" } }, text("jan")] },
    ]);
    expect(findTextMatches(node, "Färjan")).toEqual([]);
  });

  it("honours case sensitivity and treats the query as literal text", () => {
    const node = doc([paragraph(text("🚢 Färjan färjan [a+b]"))]);
    expect(findTextMatches(node, "Färjan")).toHaveLength(2);
    expect(findTextMatches(node, "Färjan", { caseSensitive: true })).toHaveLength(1);
    expect(found(node, findTextMatches(node, "[a+b]"))).toEqual(["[a+b]"]);
  });

  it("restricts whole-word matches to Swedish word boundaries, not ASCII ones", () => {
    const node = doc([paragraph(text("Johan satt. Johans bok. Sjöjohan. Johan-Erik."))]);
    expect(findTextMatches(node, "Johan", { wholeWord: true })).toHaveLength(2);
    expect(findTextMatches(node, "Johan")).toHaveLength(4);
    // "Sjöjohan" must not count: ö is a letter, so the boundary check has to be
    // Unicode-aware. A \b-based check would have matched it.
    const wide = doc([paragraph(text("Sjöjohan"))]);
    expect(findTextMatches(wide, "johan", { wholeWord: true })).toEqual([]);
  });

  it("reports surrounding text only from the same block", () => {
    const node = doc([paragraph(text("Vid kajen stod Färjan och väntade.")), paragraph(text("Nästa stycke."))]);
    const [match] = findTextMatches(node, "Färjan", { contextChars: 6 });
    expect(match.before).toBe(" stod ");
    expect(match.after).toBe(" och v");
  });

  it("stops at the limit and finds nothing for an empty query", () => {
    const node = doc([paragraph(text("aaaa"))]);
    expect(findTextMatches(node, "aa")).toEqual([{ from: 1, to: 3 }, { from: 3, to: 5 }]);
    expect(findTextMatches(node, "aa", { limit: 1 })).toHaveLength(1);
    expect(findTextMatches(node, "")).toEqual([]);
  });

  it("maps positions through lists and empty paragraphs", () => {
    const node = doc([{ type: "paragraph" }, { type: "bulletList", content: [
      { type: "listItem", content: [paragraph(text("Färjan ett"))] },
      { type: "listItem", content: [paragraph(text("Färjan två"))] },
    ] }]);
    expect(found(node, findTextMatches(node, "Färjan"))).toEqual(["Färjan", "Färjan"]);
  });
});

describe("mapTextBlocks", () => {
  it("gives one entry per text block, with a placeholder standing in for leaves", () => {
    const node = doc([paragraph(text("Ett")), { type: "paragraph", content: [text("A"), { type: "hardBreak" }, text("B")] }]);
    expect(mapTextBlocks(node).map((block) => block.text)).toEqual(["Ett", "A￼B"]);
    expect(mapTextBlocks(node)[1].positions[1]).toBe(-1);
  });
});
