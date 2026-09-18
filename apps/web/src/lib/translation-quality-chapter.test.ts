import { describe, expect, it, vi } from "vitest";
vi.mock("./ai/translation-quality/anthropic", () => ({ translateWithQuality: vi.fn() }));
import { translateWithQuality } from "./ai/translation-quality/anthropic";
import { translateQualityChapter, TranslationNeedsReviewError, buildBookProfileSample } from "./translation-quality-chapter";
import type { AuthorProfile, QualityReport } from "./ai/translation-quality/types";
const profile: AuthorProfile = { voice: "Spare", rhythm: "Short", dialogue: "Dashes", preserve: [], glossary: [] };
const report: QualityReport = { profile, status: "checks_passed", issues: [], revisionCount: 0, reviewRounds: 1, model: "test", rubricVersion: "1", usage: { inputTokens: 1, outputTokens: 1 } };
const base = { chapterId: "one", title: "Arrival", sourceLanguage: "en", targetLanguage: "sv", profile };

describe("reviewed chapter gate", () => {
  it("preserves TipTap nodes, marks and whitespace while translating the title", async () => {
    vi.mocked(translateWithQuality).mockResolvedValueOnce({ translations: ["Ankomst", "Hej", "världen"], report });
    const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Hello", marks: [{ type: "bold" }] }, { type: "text", text: " " }, { type: "text", text: "world" }] }] });
    const save = vi.fn(); const result = await translateQualityChapter({ ...base, content, onBatch: save });
    expect(result.title).toBe("Ankomst");
    expect(JSON.parse(result.content)).toEqual({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Hej", marks: [{ type: "bold" }] }, { type: "text", text: " " }, { type: "text", text: "världen" }] }] });
    expect(save).toHaveBeenCalledOnce();
  });
  it("retains plain-text paragraph spacing and blank lines", async () => {
    vi.mocked(translateWithQuality).mockResolvedValueOnce({ translations: ["Ankomst", "Ett.", "Två."], report });
    const result = await translateQualityChapter({ ...base, content: "One.\n\n\nTwo.", onBatch: vi.fn() });
    expect(result.content).toBe("Ett.\n\n\nTvå.");
  });
  it("records unresolved findings and stops before returning publishable content", async () => {
    vi.mocked(translateWithQuality).mockResolvedValueOnce({ translations: ["Ankomst", "Fel"], report: { ...report, status: "needs_review" } });
    const save = vi.fn();
    await expect(translateQualityChapter({ ...base, content: "Wrong", onBatch: save })).rejects.toBeInstanceOf(TranslationNeedsReviewError);
    expect(save).toHaveBeenCalledOnce();
  });
  it("rejects incomplete output instead of copying the source", async () => {
    vi.mocked(translateWithQuality).mockResolvedValueOnce({ translations: ["Ankomst", ""], report });
    await expect(translateQualityChapter({ ...base, content: "Hello", onBatch: vi.fn() })).rejects.toThrow();
  });
  it("does not proceed when the review report cannot be saved", async () => {
    vi.mocked(translateWithQuality).mockResolvedValueOnce({ translations: ["Ankomst", "Hej"], report });
    await expect(translateQualityChapter({ ...base, content: "Hello", onBatch: async () => { throw new Error("storage failed"); } })).rejects.toThrow("storage failed");
  });
  it("bounds profile sampling across the book", () => {
    const result = buildBookProfileSample([{ content: "FIRST " + "a".repeat(9000) }, { content: "MIDDLE " + "b".repeat(9000) }, { content: "LAST " + "c".repeat(9000) }]);
    expect(result).toContain("FIRST"); expect(result).toContain("MIDDLE"); expect(result).toContain("LAST"); expect(result.length).toBeLessThanOrEqual(6100);
  });
});
