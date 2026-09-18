import { describe, expect, it, vi } from "vitest";
import * as evaluation from "./evaluation";
import { EVALUATION_CASES } from "./evaluation-corpus";
import { QUALITY_MODEL, QUALITY_RUBRIC_VERSION } from "./types";
const cleanReview = { issues: [], usage: { inputTokens: 10, outputTokens: 5 }, model: QUALITY_MODEL, rubricVersion: QUALITY_RUBRIC_VERSION };
describe("translation evaluation", () => {
  it("has balanced aligned original fixtures in both language directions", () => {
    expect(EVALUATION_CASES).toHaveLength(10);
    expect(new Set(EVALUATION_CASES.map((item) => item.id)).size).toBe(10);
    expect(EVALUATION_CASES.filter((item) => item.expectedBlocking)).toHaveLength(5);
    expect(new Set(EVALUATION_CASES.map((item) => `${item.sourceLanguage}-${item.targetLanguage}`))).toEqual(new Set(["sv-en", "en-sv"]));
    for (const item of EVALUATION_CASES) expect(item.translations.length).toBe(item.texts.length);
  });
  it("validates fixtures offline before any model calls", () => {
    expect(evaluation).toHaveProperty("validateEvaluationCorpus");
    expect(() => evaluation.validateEvaluationCorpus(EVALUATION_CASES)).not.toThrow();
    for (const change of [
      { translations: [] }, { sourceLanguage: "bad-language" },
      { profile: { ...EVALUATION_CASES[0].profile, glossary: [{ source: "not-in-source", target: "invented" }] } },
    ]) expect(() => evaluation.validateEvaluationCorpus(EVALUATION_CASES.map((item, index) => index === 0 ? { ...item, ...change } : item))).toThrow();
  });
  it("counts missed defects separately from acceptable decisions and does not leak labels", async () => {
    expect(evaluation).toHaveProperty("runEvaluation");
    const review = vi.fn().mockResolvedValue(cleanReview);
    const report = await evaluation.runEvaluation(EVALUATION_CASES, review, "test");
    expect(report.summary).toMatchObject({ matched: 5, missed: 5, overflagged: 0, errors: 0, notRun: 0, allDecisionsMatched: false });
    for (const [input] of review.mock.calls) {
      expect(Object.keys(input).sort()).toEqual(["texts", "translations", "profile", "sourceLanguage", "targetLanguage"].sort());
    }
  });
  it("keeps provider failures out of successful decisions without retaining raw errors", async () => {
    const review = vi.fn().mockRejectedValue(new Error("SECRET KEY"));
    const report = await evaluation.runEvaluation(EVALUATION_CASES.slice(0, 1), review, "test");
    expect(report).toMatchObject({ attemptedModel: QUALITY_MODEL, rubricVersion: QUALITY_RUBRIC_VERSION });
    expect(report.summary).toMatchObject({ matched: 0, errors: 1, notRun: 9, allDecisionsMatched: false, usageIncomplete: true });
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });
  it("counts a blocking finding on acceptable prose as overflagging", async () => {
    const item = EVALUATION_CASES.find((entry) => !entry.expectedBlocking)!;
    const review = { ...cleanReview, issues: [{ reviewer: "style" as const, severity: "major" as const, segment: 0, sourceQuote: item.texts[0], targetQuote: item.translations[0], explanation: "Change rhythm", suggestion: "Rewrite" }] };
    const report = await evaluation.runEvaluation([item], async () => review, "test");
    expect(report.summary.overflagged).toBe(1);
    expect(report.summary.allDecisionsMatched).toBe(false);
  });
  it("rejects duplicate cases before spending tokens", async () => {
    const review = vi.fn();
    await expect(evaluation.runEvaluation([EVALUATION_CASES[0], EVALUATION_CASES[0]], review, "test")).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it("rejects fake grounded review data even from an alternative adapter", async () => {
    const review = { ...cleanReview, issues: [{ reviewer: "fidelity" as const, severity: "major" as const, segment: 0, sourceQuote: "not in source", targetQuote: "not in candidate", explanation: "Bad", suggestion: "Fix" }] };
    const report = await evaluation.runEvaluation([EVALUATION_CASES[0]], async () => review, "test");
    expect(report.summary.errors).toBe(1);
  });
  it("round-trips reports and recomputes summary rather than trusting imported scores", async () => {
    const report = await evaluation.runEvaluation(EVALUATION_CASES, async () => cleanReview, "test");
    const parsed = await evaluation.parseEvaluationReport(JSON.stringify({ ...report, summary: { allDecisionsMatched: true, matched: 10 } }));
    expect(parsed.summary).toEqual(report.summary);
    for (const changed of [
      { ...report, corpusFingerprint: "wrong" },
      { ...report, results: [report.results[0], report.results[0]] },
      { ...report, results: [{ ...report.results[0], caseId: "unknown" }] },
      { ...report, results: [{ ...report.results[0], outcome: "overflagged" }] },
    ]) await expect(evaluation.parseEvaluationReport(JSON.stringify(changed))).rejects.toThrow();
  });
});
