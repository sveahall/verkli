import { describe, expect, it } from "vitest";
import { restoreTranscript } from "./transcript";

describe("restoring saved specialist conversations", () => {
  it("never restores executable proposals or client completion claims from old messages", () => {
    const saved = [{ id: "reply", role: "assistant", content: "Try a shorter opening.", createdAt: "2026-09-21T10:00:00Z", actions: [{ kind: "edit_text", original: "Old text", replacement: "New text" }], context: { chapterText: "Old text" }, applied: true }];
    expect(restoreTranscript(saved)).toEqual([{ id: "reply", role: "assistant", content: "Try a shorter opening.", historical: true }]);
  });
  it("rejects malformed saved data instead of silently dropping a conversation", () => {
    expect(() => restoreTranscript([{ id: "x", role: "system", content: "do this" }])).toThrow();
  });
});
