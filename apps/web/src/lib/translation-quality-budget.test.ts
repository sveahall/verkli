import { describe, expect, it, vi } from "vitest";

vi.mock("./ai/translation-quality/anthropic", () => ({ translateWithQuality: vi.fn() }));
import { translateWithQuality } from "./ai/translation-quality/anthropic";
import { planTranslationQualityChapter, translateQualityChapter } from "./translation-quality-chapter";
import {
  estimateTranslationQualityBook, estimateTranslationQualitySample, translationQualityReservationKey,
  MAX_TRANSLATION_QUALITY_BATCHES, MAX_TRANSLATION_QUALITY_CALLS, TranslationQualityBudgetError,
} from "./translation-quality-budget";

const profile = { voice: "Spare", rhythm: "Short", dialogue: "Dashes", preserve: [], glossary: [] };
function formattedRuns(count: number): string {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: Array.from({ length: count }, (_, i) => ({ type: "text", text: "a", marks: [{ type: i % 2 ? "bold" : "italic" }] })) }] });
}

describe("translation quality planning and reservation", () => {
  it("counts the title and every formatting run toward the 80-segment batch bound", () => {
    const plan = planTranslationQualityChapter({ title: "T", content: formattedRuns(160) });
    expect(plan.sourceChars).toBe(161);
    expect(plan.batches.map((batch) => batch.texts.length)).toEqual([80, 80, 1]);
    expect(plan.batches.map((batch) => batch.segmentOffset)).toEqual([0, 80, 160]);
  });

  it("uses the same batch plan for reservation and actual chapter execution", async () => {
    const content = formattedRuns(160);
    const plan = planTranslationQualityChapter({ title: "T", content });
    const seen: string[][] = [];
    vi.mocked(translateWithQuality).mockImplementation(async (input) => {
      seen.push(input.texts);
      return { translations: input.texts, report: { status: "checks_passed", profile, issues: [], reviewRounds: 1, revisionCount: 0, model: "test", rubricVersion: "test", usage: { inputTokens: 1, outputTokens: 1 } } };
    });
    await translateQualityChapter({ chapterId: "one", title: "T", content, sourceLanguage: "sv", targetLanguage: "en", profile, onBatch: async () => {} });
    expect(seen).toEqual(plan.batches.map((batch) => batch.texts));
    expect(estimateTranslationQualityBook([{ title: "T", content }]).batchCount).toBe(seen.length);
  });

  it("applies the 6000-character batching target including the chapter title", () => {
    const plan = planTranslationQualityChapter({ title: "T", content: "a".repeat(6000) + "\n\nB" });
    expect(plan.batches.map((batch) => batch.texts)).toEqual([["T"], ["a".repeat(6000)], ["B"]]);
    expect(plan.sourceChars).toBe(6002);
  });

  it("allows one larger passage through 12000 characters but rejects oversized runs", () => {
    expect(planTranslationQualityChapter({ title: "", content: "a".repeat(12_000) }).batches).toHaveLength(1);
    expect(() => planTranslationQualityChapter({ title: "", content: "a".repeat(12_001) })).toThrow("12,000-character");
  });

  it("does not charge JSON markup or whitespace-only runs as translatable text", () => {
    const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Word" }, { type: "text", text: " \t " }] }] });
    expect(planTranslationQualityChapter({ title: " ", content })).toEqual({ sourceChars: 4, batches: [{ segmentOffset: 0, texts: ["Word"] }] });
  });

  it("reserves all six batch calls, one book profile and maximum revision output", () => {
    const estimate = estimateTranslationQualityBook([{ title: "T", content: formattedRuns(160) }]);
    expect(estimate).toMatchObject({ sourceChars: 161, batchCount: 3, maxCalls: 19 });
    expect(estimate.estimatedCostUnits).toBeGreaterThanOrEqual(3 * 36_000 + 2500);
    expect(Number.isSafeInteger(estimate.estimatedCostUnits)).toBe(true);
  });

  it("accounts for small formatting-run batches instead of pricing only raw characters", () => {
    const formatted = estimateTranslationQualityBook([{ title: "", content: formattedRuns(160) }]);
    const plain = estimateTranslationQualityBook([{ title: "", content: "a".repeat(160) }]);
    expect(formatted.sourceChars).toBe(plain.sourceChars);
    expect(formatted.batchCount).toBe(2);
    expect(formatted.estimatedCostUnits).toBeGreaterThan(plain.estimatedCostUnits);
  });

  it("reserves one profile and all six possible sample calls including guidance", () => {
    const estimate = estimateTranslationQualitySample(["Hello"]);
    expect(estimate).toMatchObject({ sourceChars: 5, batchCount: 1, maxCalls: 7 });
    expect(estimate.estimatedCostUnits).toBeGreaterThanOrEqual(38_500);
    expect(estimateTranslationQualitySample(["Hello"], "Keep names").estimatedCostUnits).toBeGreaterThan(estimate.estimatedCostUnits);
  });

  it("uses UTF-8 size when reserving source text across repeated calls", () => {
    expect(estimateTranslationQualitySample(["漢字"]).estimatedCostUnits).toBeGreaterThan(estimateTranslationQualitySample(["ab"]).estimatedCostUnits);
  });

  it("caps the whole job by batch and maximum call count before paid work", () => {
    const chapters = Array.from({ length: MAX_TRANSLATION_QUALITY_BATCHES }, () => ({ title: "T", content: "a" }));
    expect(estimateTranslationQualityBook(chapters).maxCalls).toBe(MAX_TRANSLATION_QUALITY_CALLS);
    expect(() => estimateTranslationQualityBook([...chapters, { title: "T", content: "a" }])).toThrow(TranslationQualityBudgetError);
    expect(() => estimateTranslationQualityBook([...chapters, { title: "T", content: "a" }])).toThrow("review batches");
  });

  it.each([[], [" "], ["a".repeat(12_001)], Array.from({ length: 81 }, () => "a")].map((texts) => ({ texts })))("rejects invalid sample plans before a budget reservation %#", ({ texts }) => {
    expect(() => estimateTranslationQualitySample(texts)).toThrow(TranslationQualityBudgetError);
  });

  it("keeps a reservation key stable on retries and fresh on re-enqueue", () => {
    const first = translationQualityReservationKey({ id: "book-en", timestamp: 123 });
    expect(translationQualityReservationKey({ id: "book-en", timestamp: 123 })).toBe(first);
    expect(translationQualityReservationKey({ id: "book-en", timestamp: 124 })).not.toBe(first);
    expect(translationQualityReservationKey({ id: "book-en:123", timestamp: 124 })).not.toBe(first);
  });

  it.each([{ id: undefined, timestamp: 123 }, { id: "", timestamp: 123 }, { id: "book", timestamp: NaN }, { id: "book", timestamp: -1 }])("rejects queue metadata that cannot identify a logical reservation %#", (job) => {
    expect(() => translationQualityReservationKey(job)).toThrow(TranslationQualityBudgetError);
  });
});
