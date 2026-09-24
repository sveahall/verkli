import { describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { chapterSchema } from "@/lib/tiptap-schema";
import { insertSavedCandidate } from "./insertion";
import { candidateImageReference } from "./media-reference";
import type { SavedCandidate } from "./contracts";

const scope = { bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222", chapterId: "33333333-3333-4333-8333-333333333333" };
const id = "44444444-4444-4444-8444-444444444444";
const candidate: SavedCandidate = { id, version: 1, createdAt: "2026-09-24T10:00:00Z", alt: "Forest", placement: "icon", styleSnapshot: { name: "Ink", medium: "Pen", palette: "Black" }, width: 100, height: 100, sourceChapterVersion: 1, imageUrl: candidateImageReference(scope, id) };
function setup() {
  let state = EditorState.create({ schema: chapterSchema, plugins: [history()], doc: chapterSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Unsaved text" }] }] }) });
  const dispatch = vi.fn((transaction) => { state = state.apply(transaction); });
  const current = vi.fn(() => true);
  const verify = vi.fn(async () => {});
  return { dispatch, current, verify, getState: () => state, insert: (value = candidate, alt = "A forest") => insertSavedCandidate({ scope, candidate: value, alt, getState: () => state, dispatch, isCurrent: current, verify }) };
}

describe("saved illustration insertion", () => {
  it("preserves selected and unsaved text and undo removes only the image", async () => {
    const f = setup();
    f.dispatch(f.getState().tr.insertText(" more", 13));
    f.dispatch(f.getState().tr.setSelection(TextSelection.create(f.getState().doc, 1, 8)));
    const before = f.getState().doc.toJSON();
    await f.insert();
    expect(f.getState().doc.textContent).toBe("Unsaved text more");
    const images: unknown[] = [];
    f.getState().doc.descendants((node) => { if (node.type.name === "image") images.push(node.attrs); });
    expect(images).toEqual([expect.objectContaining({ src: candidate.imageUrl, alt: "A forest" })]);
    expect(undo(f.getState(), f.dispatch)).toBe(true);
    expect(f.getState().doc.toJSON()).toEqual(before);
  });
  it("inserts after a selected final image without replacing it", async () => {
    const f = setup();
    const existing = chapterSchema.nodes.image.create({ src: "https://example.test/existing.png", alt: "Original" });
    const at = f.getState().doc.content.size;
    f.dispatch(f.getState().tr.insert(at, existing));
    f.dispatch(f.getState().tr.setSelection(NodeSelection.create(f.getState().doc, at)));
    await f.insert();
    const sources: string[] = [];
    f.getState().doc.descendants((node) => { if (node.type.name === "image") sources.push(node.attrs.src); });
    expect(sources).toEqual(["https://example.test/existing.png", candidate.imageUrl]);
  });
  it("uses the live document after permission verification, never an old snapshot", async () => {
    const f = setup();
    f.verify.mockImplementation(async () => { f.dispatch(f.getState().tr.insertText("New draft ", 1)); });
    await f.insert();
    expect(f.getState().doc.textContent).toBe("New draft Unsaved text");
  });
  it.each(["editionId", "chapterId", "bookId"] as const)("rejects a candidate from another %s", async (key) => {
    const f = setup();
    await expect(f.insert({ ...candidate, imageUrl: candidateImageReference({ ...scope, [key]: id }, id) })).rejects.toThrow(/chapter/i);
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
  });
  it("does not change the draft on permission failure", async () => {
    const f = setup(); f.verify.mockRejectedValue(new Error("Permission denied"));
    await expect(f.insert()).rejects.toThrow("Permission denied");
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it("ignores completion after a chapter or account change", async () => {
    const f = setup(); f.verify.mockImplementation(async () => { f.current.mockReturnValue(false); });
    await expect(f.insert()).rejects.toThrow(/changed/i);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it("requires bounded nonempty alternative text", async () => {
    const f = setup();
    for (const alt of [" ", "a".repeat(501)]) await expect(f.insert(candidate, alt)).rejects.toThrow(/description/i);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
});
