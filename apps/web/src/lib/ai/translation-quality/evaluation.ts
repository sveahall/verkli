import { z } from "zod";
import { EVALUATION_CASES, EVALUATION_CORPUS_VERSION, type EvaluationCase } from "./evaluation-corpus";
import { validateReviewerResult, validateQualityInput, validateAuthorProfile, assertTranslationSegments, type ReviewInput } from "./pipeline";
import { QUALITY_MODEL, QUALITY_RUBRIC_VERSION } from "./types";
import type { CandidateReview } from "./anthropic";

const bounded = z.string().max(2000);
const reviewSchema = z.object({
  issues: z.array(z.object({
    reviewer: z.enum(["fidelity", "style"]), severity: z.enum(["minor", "major", "critical"]),
    segment: z.number().int().nonnegative(), sourceQuote: bounded.min(1), targetQuote: bounded.min(1),
    explanation: bounded.min(1), suggestion: bounded.min(1),
  })).max(160),
  usage: z.object({ inputTokens: z.number().int().nonnegative().max(1e8), outputTokens: z.number().int().nonnegative().max(1e8) }),
  model: z.string().min(1).max(120), rubricVersion: z.string().min(1).max(120),
});
const resultSchema = z.object({
  caseId: z.string().max(100), outcome: z.enum(["matched", "missed", "overflagged", "error"]),
  review: reviewSchema.nullable(), errorCode: z.enum(["REVIEW_FAILED", "INVALID_REVIEW"]).nullable(),
  elapsedMs: z.number().int().nonnegative().max(3_600_000),
});
const reportSchema = z.object({
  schemaVersion: z.literal(1), corpusVersion: z.literal(EVALUATION_CORPUS_VERSION), corpusFingerprint: z.string(),
  attemptedModel: z.string().min(1).max(120), rubricVersion: z.string().min(1).max(120),
  createdAt: z.string().datetime(), mode: z.enum(["live", "test"]),
  results: z.array(resultSchema).min(1).max(EVALUATION_CASES.length),
});
export type EvaluationResult = z.infer<typeof resultSchema>;
type ReportData = z.infer<typeof reportSchema>;
export type EvaluationReport = ReportData & { summary: ReturnType<typeof summarizeEvaluation> };

export function validateEvaluationCorpus(cases: EvaluationCase[] = EVALUATION_CASES): void {
  if (cases.length !== 10 || new Set(cases.map((sample) => sample.id)).size !== cases.length ||
    cases.filter((sample) => sample.expectedBlocking).length !== 5) throw new Error("Corpus needs ten unique cases with five clean and five defective candidates.");
  for (const sample of cases) {
    validateQualityInput(sample);
    assertTranslationSegments(sample.texts, sample.translations);
    validateAuthorProfile(sample.profile, sample.texts.join("\n"));
    const pair = cases.filter((entry) => entry.category === sample.category);
    if (pair.length !== 2 || pair[0].expectedBlocking === pair[1].expectedBlocking ||
      JSON.stringify(pair[0].texts) !== JSON.stringify(pair[1].texts) || JSON.stringify(pair[0].profile) !== JSON.stringify(pair[1].profile) ||
      pair[0].sourceLanguage !== pair[1].sourceLanguage || pair[0].targetLanguage !== pair[1].targetLanguage) {
      throw new Error("Each category needs a clean/defective pair sharing source, languages and author profile.");
    }
  }
}

/** Binds a report to exact sources, candidates, profiles and provisional labels. */
export async function corpusFingerprint(): Promise<string> {
  validateEvaluationCorpus();
  const bytes = new TextEncoder().encode(JSON.stringify(EVALUATION_CASES));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateReview(sample: EvaluationCase, value: unknown): CandidateReview {
  const review = reviewSchema.parse(value);
  for (const reviewer of ["fidelity", "style"] as const) validateReviewerResult(sample.texts, sample.translations, reviewer, {
    reviewedSegments: sample.texts.map((_, index) => index),
    issues: review.issues.filter((issue) => issue.reviewer === reviewer),
  });
  return review;
}
function outcome(sample: EvaluationCase, review: CandidateReview): EvaluationResult["outcome"] {
  const blocking = review.issues.some((issue) => issue.severity !== "minor");
  return blocking === sample.expectedBlocking ? "matched" : sample.expectedBlocking ? "missed" : "overflagged";
}
export function summarizeEvaluation(results: EvaluationResult[]) {
  const matched = results.filter((result) => result.outcome === "matched").length;
  const errors = results.filter((result) => result.outcome === "error").length;
  return {
    total: EVALUATION_CASES.length, evaluated: results.length, notRun: EVALUATION_CASES.length - results.length,
    matched, missed: results.filter((result) => result.outcome === "missed").length,
    overflagged: results.filter((result) => result.outcome === "overflagged").length, errors,
    allDecisionsMatched: matched === EVALUATION_CASES.length,
    reportedInputTokens: results.reduce((sum, result) => sum + (result.review?.usage.inputTokens ?? 0), 0),
    reportedOutputTokens: results.reduce((sum, result) => sum + (result.review?.usage.outputTokens ?? 0), 0),
    usageIncomplete: errors > 0,
  };
}

export async function runEvaluation(
  cases: EvaluationCase[], review: (input: ReviewInput) => Promise<CandidateReview>, mode: "live" | "test",
  onResult?: (result: EvaluationResult) => void,
): Promise<EvaluationReport> {
  if (!cases.length || cases.length > EVALUATION_CASES.length || new Set(cases.map((sample) => sample.id)).size !== cases.length ||
    cases.some((sample) => JSON.stringify(sample) !== JSON.stringify(EVALUATION_CASES.find((entry) => entry.id === sample.id)))) {
    throw new Error("Use unique, unchanged cases from the evaluation corpus.");
  }
  validateEvaluationCorpus();
  const results: EvaluationResult[] = [];
  for (const sample of cases) {
    const start = Date.now();
    let result: EvaluationResult;
    try {
      // Construct the payload explicitly. Expected decisions, labels, IDs and
      // rationale must stay outside model context to prevent answer leakage.
      const received = await review({ texts: sample.texts, translations: sample.translations, profile: sample.profile,
        sourceLanguage: sample.sourceLanguage, targetLanguage: sample.targetLanguage });
      let checked: CandidateReview;
      try { checked = validateReview(sample, received);
        if (checked.model !== QUALITY_MODEL || checked.rubricVersion !== QUALITY_RUBRIC_VERSION) throw new Error("Provenance mismatch");
      } catch { throw new Error("INVALID_REVIEW"); }
      result = { caseId: sample.id, outcome: outcome(sample, checked), review: checked, errorCode: null, elapsedMs: Date.now() - start };
    } catch (error) {
      result = { caseId: sample.id, outcome: "error", review: null,
        errorCode: error instanceof Error && error.message === "INVALID_REVIEW" ? "INVALID_REVIEW" : "REVIEW_FAILED", elapsedMs: Date.now() - start };
    }
    results.push(result);
    onResult?.(result);
  }
  return { schemaVersion: 1, corpusVersion: EVALUATION_CORPUS_VERSION, corpusFingerprint: await corpusFingerprint(),
    attemptedModel: QUALITY_MODEL, rubricVersion: QUALITY_RUBRIC_VERSION,
    createdAt: new Date().toISOString(), mode, results, summary: summarizeEvaluation(results) };
}

export async function parseEvaluationReport(raw: string): Promise<EvaluationReport> {
  if (raw.length > 2_000_000) throw new Error("Report must be smaller than 2 MB.");
  const data = reportSchema.parse(JSON.parse(raw));
  if (data.corpusFingerprint !== await corpusFingerprint() || new Set(data.results.map((result) => result.caseId)).size !== data.results.length) {
    throw new Error("This report does not match the current corpus or contains duplicate results.");
  }
  for (const result of data.results) {
    const sample = EVALUATION_CASES.find((item) => item.id === result.caseId);
    if (!sample) throw new Error("Report contains an unknown case.");
    if (result.outcome === "error") {
      if (result.review !== null || result.errorCode === null) throw new Error("Invalid error result.");
    } else if (!result.review || result.review.model !== data.attemptedModel || result.review.rubricVersion !== data.rubricVersion || result.errorCode !== null || outcome(sample, validateReview(sample, result.review)) !== result.outcome) {
      throw new Error("Report decision does not match its findings.");
    }
  }
  return { ...data, summary: summarizeEvaluation(data.results) };
}
