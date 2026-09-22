import { describe, expect, it } from "vitest";
import { applyPronunciation, pronunciationRulesSchema, samePronunciationScope, parsePronunciationSnapshot } from "./pronunciation";
const scope = { ownerId: "owner", bookId: "book", editionId: "edition" };
describe("pronunciation contract", () => {
  it("uses literal, case-sensitive, longest matches in one pass", () => {
    expect(applyPronunciation("Mira Mira Bay mira $x", [
      { word: "Mira", spokenAs: "Mira Bay" }, { word: "Mira Bay", spokenAs: "Meer-ah bay" }, { word: "$x", spokenAs: "$&" },
    ])).toEqual({ text: "Mira Bay Meer-ah bay mira $&", matches: [
      { start: 0, end: 4, word: "Mira", spokenAs: "Mira Bay" },
      { start: 5, end: 13, word: "Mira Bay", spokenAs: "Meer-ah bay" },
      { start: 19, end: 21, word: "$x", spokenAs: "$&" },
    ] });
  });
  it("preserves Unicode and manuscript input without mutation", () => {
    const text = "😀 Mira, Mira.";
    const rules = [{ word: "Mira", spokenAs: "Mee-ra" }];
    expect(applyPronunciation(text, rules).text).toBe("😀 Mee-ra, Mee-ra.");
    expect(text).toBe("😀 Mira, Mira."); expect(rules[0].word).toBe("Mira");
    expect(applyPronunciation(text, []).text).toBe(text);
  });
  it("rejects duplicate, empty or excessive rules without trimming written matches", () => {
    expect(pronunciationRulesSchema.safeParse([{ word: " ", spokenAs: "ok" }]).success).toBe(false);
    expect(pronunciationRulesSchema.safeParse([{ word: "Mira", spokenAs: "A" }, { word: "Mira", spokenAs: "B" }]).success).toBe(false);
    expect(pronunciationRulesSchema.safeParse(Array.from({ length: 101 }, (_, i) => ({ word: String(i), spokenAs: "a" }))).success).toBe(false);
    expect(pronunciationRulesSchema.parse([{ word: " A ", spokenAs: "B" }])[0].word).toBe(" A ");
  });
  it("rejects snapshots from another owner, book or edition", () => {
    const snapshot = { scope, revision: 1, rules: [] };
    expect(parsePronunciationSnapshot(snapshot, scope)).toEqual(snapshot);
    for (const key of ["ownerId", "bookId", "editionId"] as const) {
      const other = { ...scope, [key]: "other" };
      expect(samePronunciationScope(scope, other)).toBe(false);
      expect(() => parsePronunciationSnapshot(snapshot, other)).toThrow();
    }
  });
});
