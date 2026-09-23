import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { extractAgentChapterText } from "@/lib/ai/agent-actions";
import { createAgentEditTransaction } from "./editor-action";

const schema = getSchema([StarterKit]);
function fixture(text = "The wierd word.") {
  return EditorState.create({ schema, plugins: [history()], doc: schema.nodeFromJSON({ type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "The chapter" }] },
    { type: "paragraph", content: [{ type: "text", text, marks: [{ type: "bold" }] }] },
  ] }) });
}
const action = { kind: "edit_text", original: "wierd", replacement: "weird", reason: "Spelling." } as const;
function context(state: EditorState) { return { chapterId: "one", chapterText: extractAgentChapterText(state.doc.toJSON()) }; }

describe("reviewed agent edits", () => {
  it("corrects the exact passage, preserves formatting and surrounding blocks, and undoes in one step", () => {
    const initial = fixture();
    const transaction = createAgentEditTransaction(initial, "one", context(initial), action);
    let state = initial.apply(transaction);
    expect(state.doc.child(0).eq(initial.doc.child(0))).toBe(true);
    expect(state.doc.child(1).textContent).toBe("The weird word.");
    expect(state.doc.child(1).child(0).marks[0].type.name).toBe("bold");
    expect(undo(state, (tr) => { state = state.apply(tr); })).toBe(true);
    expect(state.doc.eq(initial.doc)).toBe(true);
  });
  it("rejects a changed draft and a different chapter before constructing a transaction", () => {
    const original = fixture();
    expect(() => createAgentEditTransaction(fixture("A changed wierd word."), "one", context(original), action)).toThrow(/changed/);
    expect(() => createAgentEditTransaction(original, "two", context(original), action)).toThrow(/chapter/);
  });
  it("rejects ambiguous, missing, empty and structurally split targets", () => {
    for (const value of ["wierd wierd", "already correct"]) {
      const state = fixture(value);
      expect(() => createAgentEditTransaction(state, "one", context(state), action)).toThrow(/exactly one/);
    }
    const state = fixture();
    expect(() => createAgentEditTransaction(state, "one", context(state), { ...action, original: "" })).toThrow();
    expect(() => createAgentEditTransaction(state, "one", context(state), { ...action, original: "chapter\n\nThe" })).toThrow(/single paragraph/);
  });
  it("treats replacement markup as literal text and handles emoji offsets", () => {
    const state = fixture("🚢 The wierd word.");
    const changed = state.apply(createAgentEditTransaction(state, "one", context(state), { ...action, replacement: "<img src=x>" }));
    expect(changed.doc.child(1).textContent).toBe("🚢 The <img src=x> word.");
    expect(changed.doc.child(1).childCount).toBe(1);
  });
  it("preserves emphasis when a spelling proposal quotes the whole sentence", () => {
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [{type: "paragraph", content: [
      {type:"text",text:"The "}, {type:"text",text:"wierd",marks:[{type:"bold"}]}, {type:"text",text:" word."},
    ]}] }) });
    const changed = state.apply(createAgentEditTransaction(state, "one", context(state), { ...action, original: "The wierd word.", replacement: "The weird word." }));
    expect(changed.doc.child(0).child(1).text).toBe("weird");
    expect(changed.doc.child(0).child(1).marks[0].type.name).toBe("bold");
    expect(() => createAgentEditTransaction(state, "one", context(state), { ...action, original: "The wierd word.", replacement: "A very strange sentence." })).toThrow(/formatting/);
  });
  it("uses target formatting instead of the current typing marks, including boundary insertions", () => {
    for (const [original,replacement] of [["wierd","weird"],["cat","scat"],["cat","cats"]]) {
      let state = EditorState.create({ schema, doc: schema.nodeFromJSON({type:"doc",content:[{type:"paragraph",content:[
        {type:"text",text:"The "},{type:"text",text:original,marks:[{type:"bold"}]},{type:"text",text:" word."},
      ]}]}) });
      state = state.apply(state.tr.setStoredMarks([schema.marks.italic.create()]));
      const changed = state.apply(createAgentEditTransaction(state,"one",context(state),{...action,original,replacement}));
      expect(changed.doc.child(0).childCount).toBe(3);
      expect(changed.doc.child(0).child(1).text).toBe(replacement);
      expect(changed.doc.child(0).child(1).marks.map(mark=>mark.type.name)).toEqual(["bold"]);
    }
  });
  it("refuses ambiguous formatting at an insertion boundary inside a quoted sentence", () => {
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON({type:"doc",content:[{type:"paragraph",content:[
      {type:"text",text:"The "},{type:"text",text:"worl",marks:[{type:"bold"}]},{type:"text",text:" is big."},
    ]}]}) });
    expect(() => createAgentEditTransaction(state,"one",context(state),{...action,original:"The worl is big.",replacement:"The world is big."})).toThrow(/smaller correction/);
    const changed = state.apply(createAgentEditTransaction(state,"one",context(state),{...action,original:"worl",replacement:"world"}));
    expect(changed.doc.child(0).child(1).text).toBe("world");
    expect(changed.doc.child(0).child(1).marks[0].type.name).toBe("bold");
  });
  it("does not combine an edit with preceding typing when undoing", () => {
    let state = fixture();
    state = state.apply(state.tr.insertText("New ", 14));
    const before = state.doc;
    state = state.apply(createAgentEditTransaction(state, "one", context(state), action));
    undo(state, (tr) => { state = state.apply(tr); });
    expect(state.doc.eq(before)).toBe(true);
  });
});
