import { describe, expect, it } from "vitest";
import { parseChapterDocument } from "./book-context";

/** Codex's failing input: one paragraph whose shape the importer rewrote. */
const stored = {
  type: "doc",
  content: [{
    type: "paragraph",
    content: [
      { type: "text", text: "Listen! Jo" },
      { type: "text", text: "han", marks: [{ type: "italic" }] },
      { type: "text", text: " walked slowly toward the harbor with his sister and they talked about all the people who had lived in the village before the storm arrived that night." },
    ],
  }],
};

describe("parseChapterDocument", () => {
  it("parses a stored chapter as it is, rather than reinterpreting it", () => {
    // apply() writes the whole parsed chapter back after a single approved word
    // change, so any reinterpretation here lands in the manuscript. Going
    // through toTiptapContent — a lenient importer, not a parser — turned
    // "Listen!" into a heading, split the text node mid-word and dropped the
    // italics, all from approving one unrelated replacement.
    const parsed = parseChapterDocument(JSON.stringify(stored)).toJSON();

    // One paragraph still — no heading was invented from "Listen!".
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0].type).toBe("paragraph");
    // The three text nodes survive with their marks: "Jo" and "han" are not
    // rejoined or split, and the italics are still there. ProseMirror adds the
    // schema's own attrs to the block, which changes no text.
    expect(parsed.content[0].content).toEqual(stored.content[0].content);
  });

  it("keeps reinterpreting the legacy generations, which is what it is for", () => {
    const fromPlainText = parseChapterDocument("Kapitel ett\n\nDet var en gång.");
    expect(fromPlainText.textBetween(0, fromPlainText.content.size, " ")).toContain("Det var en gång.");

    const fromHtml = parseChapterDocument("<p>Det var <em>en gång</em>.</p>");
    expect(fromHtml.textBetween(0, fromHtml.content.size, " ")).toContain("en gång");
  });

  it("gives an empty chapter a document rather than failing", () => {
    for (const value of [null, "", "   "]) {
      expect(parseChapterDocument(value).childCount).toBe(1);
    }
  });
});
