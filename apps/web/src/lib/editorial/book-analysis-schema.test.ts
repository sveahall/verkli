import { describe, expect, it } from "vitest";
import { BOOK_ANALYSIS_CATEGORIES, bookAnalysisNotesSchema, bookAnalysisReportSchema } from "./book-analysis-schema";
const note = { category: "plot", observation: "A promise is made.", evidence: [{ chapterId: "one", quote: " A promise. " }] };
describe("whole-book analysis schemas", () => {
  it("preserves exact quote whitespace and caps extraction output", () => {
    expect(bookAnalysisNotesSchema.parse([note])[0].evidence[0].quote).toBe(" A promise. ");
    expect(bookAnalysisNotesSchema.safeParse(Array(11).fill(note)).success).toBe(false);
    expect(bookAnalysisNotesSchema.safeParse([{ ...note, evidence: [{ chapterId: "one", quote: "a".repeat(401) }] }]).success).toBe(false);
    expect(bookAnalysisNotesSchema.safeParse([{ ...note, evidence: [{ chapterId: "one", quote: "  " }] }]).success).toBe(false);
  });
  it("requires all four areas even if no issue is identified and forbids rewrite fields", () => {
    const report = { summary: "No cross-chapter issue identified from these notes.", areas: BOOK_ANALYSIS_CATEGORIES.map((category) => ({ category, summary: "Evidence reviewed." })), findings: [] };
    expect(bookAnalysisReportSchema.safeParse(report).success).toBe(true);
    expect(bookAnalysisReportSchema.safeParse({ ...report, areas: report.areas.slice(1) }).success).toBe(false);
    expect(bookAnalysisReportSchema.safeParse({ ...report, corrections: [] }).success).toBe(false);
  });
});
