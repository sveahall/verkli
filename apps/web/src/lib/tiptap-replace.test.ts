import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { chapterSchema } from "./tiptap-schema";
import { findTextMatches } from "./tiptap-text-offsets";
import { replaceTextRanges } from "./tiptap-replace";

const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: ReturnType<typeof text>[]) => ({ type: "paragraph", content });

function fixture(content: unknown[]) {
  return EditorState.create({
    schema: chapterSchema,
    plugins: [history()],
    doc: chapterSchema.nodeFromJSON({ type: "doc", content }),
  });
}
const plain = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, "\n");
const editsFor = (state: EditorState, from: string, to: string) =>
  findTextMatches(state.doc, from, { caseSensitive: true }).map((target) => ({ target, original: from, replacement: to }));

describe("replaceTextRanges", () => {
  it("applies every occurrence across blocks in one transaction", () => {
    const state = fixture([
      paragraph(text("Johan kom hem. Johan var trött.")),
      paragraph(text("Sedan sov Johan.")),
    ]);
    const { transaction, applied, skipped } = replaceTextRanges(state, editsFor(state, "Johan", "Jonas"));
    expect({ applied, skipped }).toEqual({ applied: 3, skipped: [] });
    expect(plain(state.apply(transaction))).toBe("Jonas kom hem. Jonas var trött.\nSedan sov Jonas.");
  });

  it("stays correct when the replacement is longer or shorter than what it replaces", () => {
    // Positions are taken from the original document, so a naive forward pass
    // would drift once the first edit changed the document's length.
    const state = fixture([paragraph(text("a Johan b Johan c Johan d"))]);
    const grown = state.apply(replaceTextRanges(state, editsFor(state, "Johan", "Johannes Persson")).transaction);
    expect(plain(grown)).toBe("a Johannes Persson b Johannes Persson c Johannes Persson d");
    const shrunk = state.apply(replaceTextRanges(state, editsFor(state, "Johan", "Jo")).transaction);
    expect(plain(shrunk)).toBe("a Jo b Jo c Jo d");
  });

  it("keeps a mark that covers only part of the replaced word", () => {
    const state = fixture([paragraph(text("Jo"), text("han", [{ type: "bold" }]), text(" gick."))]);
    const applied = state.apply(replaceTextRanges(state, editsFor(state, "Johan", "Jonas")).transaction);
    // "Jo" is unchanged and untouched; only "han" → "nas" is rewritten, so the
    // bold survives instead of being flattened across the whole word.
    const marks = applied.doc.toJSON().content[0].content;
    expect(marks).toEqual([
      { type: "text", text: "Jo" },
      { type: "text", text: "nas", marks: [{ type: "bold" }] },
      { type: "text", text: " gick." },
    ]);
  });

  it("reports the edits it could not apply and still applies the rest", () => {
    const state = fixture([
      paragraph(text("Johan gick.")),
      paragraph(text("Jo"), text("han", [{ type: "bold" }]), text("sson kom.")),
    ]);
    const edits = [
      ...editsFor(state, "Johan gick", "Jonas gick"),
      // Spans the plain/bold seam with no shared prefix, so it cannot be
      // rewritten without destroying one of the two formattings.
      ...editsFor(state, "Johansson", "Karlsson"),
    ];
    const { applied, skipped, transaction } = replaceTextRanges(state, edits, { skipInvalid: true });
    expect(applied).toBe(1);
    expect(skipped).toEqual([{ index: 1, reason: expect.stringMatching(/formatting/) }]);
    expect(plain(state.apply(transaction))).toBe("Jonas gick.\nJohansson kom.");
  });

  it("throws instead of skipping when a single edit is asked for", () => {
    const state = fixture([paragraph(text("Jo"), text("han", [{ type: "bold" }]), text("sson kom."))]);
    expect(() => replaceTextRanges(state, editsFor(state, "Johansson", "Karlsson"))).toThrow(/formatting/);
  });

  it("undoes the whole batch in one step", () => {
    const state = fixture([paragraph(text("Johan och Johan."))]);
    const applied = state.apply(replaceTextRanges(state, editsFor(state, "Johan", "Jonas")).transaction);
    expect(plain(applied)).toBe("Jonas och Jonas.");
    let restored = applied;
    undo(applied, (transaction) => { restored = applied.apply(transaction); });
    expect(plain(restored)).toBe("Johan och Johan.");
  });
});
