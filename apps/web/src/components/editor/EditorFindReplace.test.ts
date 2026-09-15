import { describe, expect, it } from "vitest";
import { getSchema, type Editor } from "@tiptap/core";
import { Transform } from "@tiptap/pm/transform";
import StarterKit from "@tiptap/starter-kit";
import { findAllMatches } from "./EditorFindReplace";

const schema = getSchema([StarterKit]);
const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: ReturnType<typeof text>[]) => ({ type: "paragraph", content });
function fixture(content: unknown[]) {
  const doc = schema.nodeFromJSON({ type: "doc", content });
  return { editor: { state: { doc } } as Editor, doc };
}

describe("editor find positions", () => {
  it("finds both occurrences at their exact document positions across blocks", () => {
    const { editor, doc } = fixture([
      { type: "heading", attrs: { level: 2 }, content: [text("Hamnen")] },
      paragraph(text("Färjan låg kvar.")),
      paragraph(text("Vid landgången. Färjan väntade.")),
    ]);
    const matches = findAllMatches(editor, "Färjan", false);
    expect(matches).toHaveLength(2);
    expect(matches.map(({ from, to }) => doc.textBetween(from, to))).toEqual(["Färjan", "Färjan"]);
    let replaced = doc;
    for (const match of [...matches].reverse()) replaced = new Transform(replaced).replaceWith(match.from, match.to, schema.text("Båten")).doc;
    expect(replaced.textBetween(0, replaced.content.size, "\n")).toBe("Hamnen\nBåten låg kvar.\nVid landgången. Båten väntade.");
  });
  it("joins adjacent text with different formatting without shifting positions", () => {
    const { editor, doc } = fixture([paragraph(text("En "), text("Fär", [{ type: "bold" }]), text("jan kom."))]);
    const matches = findAllMatches(editor, "Färjan", false);
    expect(matches).toHaveLength(1);
    expect(doc.textBetween(matches[0].from, matches[0].to)).toBe("Färjan");
  });
  it("uses actual positions inside lists and after empty paragraphs", () => {
    const { editor, doc } = fixture([{ type: "paragraph" }, { type: "bulletList", content: [
      { type: "listItem", content: [paragraph(text("Färjan ett"))] },
      { type: "listItem", content: [paragraph(text("Färjan två"))] },
    ] }]);
    const matches = findAllMatches(editor, "Färjan", false);
    expect(matches).toHaveLength(2);
    expect(matches.map(({ from, to }) => doc.textBetween(from, to))).toEqual(["Färjan", "Färjan"]);
  });
  it("keeps matches inside text blocks and does not span hard breaks", () => {
    const { editor } = fixture([paragraph(text("Fär")), paragraph(text("jan")), { type: "paragraph", content: [text("Fär"), { type: "hardBreak" }, text("jan")] }]);
    expect(findAllMatches(editor, "Färjan", false)).toEqual([]);
  });
  it("supports case sensitivity, literal punctuation and UTF-16 positions", () => {
    const { editor, doc } = fixture([paragraph(text("🚢 Färjan färjan [a+b]"))]);
    expect(findAllMatches(editor, "Färjan", false)).toHaveLength(2);
    expect(findAllMatches(editor, "Färjan", true)).toHaveLength(1);
    const matches = findAllMatches(editor, "[a+b]", false);
    expect(matches).toHaveLength(1);
    expect(doc.textBetween(matches[0].from, matches[0].to)).toBe("[a+b]");
  });
  it("does not produce overlapping replace ranges or matches for an empty query", () => {
    const { editor } = fixture([paragraph(text("aaaa"))]);
    expect(findAllMatches(editor, "aa", false)).toEqual([{ from: 1, to: 3 }, { from: 3, to: 5 }]);
    expect(findAllMatches(editor, "", false)).toEqual([]);
  });
});
