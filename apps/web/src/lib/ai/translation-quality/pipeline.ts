import { z } from "zod";

import {
  MAX_AUTHOR_GUIDANCE_CHARS, MAX_QUALITY_SEGMENTS, MAX_QUALITY_SOURCE_CHARS,
  QUALITY_MODEL, QUALITY_RUBRIC_VERSION,
  type AuthorProfile, type QualityInput, type QualityIssue, type QualityResult, type TokenUsage,
} from "./types";

export type QualityCallResult = { data: unknown; usage: TokenUsage };
export type ReviewInput = QualityInput & { profile: AuthorProfile; translations: string[] };
export type RevisionInput = ReviewInput & { issues: QualityIssue[]; segments: number[] };
export type QualityDependencies = {
  cancelReviews?: () => void;
  profile(input: QualityInput): Promise<QualityCallResult>;
  translate(input: QualityInput & { profile: AuthorProfile }): Promise<QualityCallResult>;
  review(reviewer: QualityIssue["reviewer"], input: ReviewInput): Promise<QualityCallResult>;
  revise(input: RevisionInput): Promise<QualityCallResult>;
};

export class TranslationQualityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TranslationQualityError";
  }
}

const profileText = z.string().trim().min(1).max(1000);
const profileSchema = z.object({
  voice: profileText,
  rhythm: profileText,
  dialogue: profileText,
  preserve: z.array(z.string().trim().min(1).max(300)).max(20),
  glossary: z.array(z.object({ source: z.string().trim().min(1).max(200), target: z.string().trim().min(1).max(200) })).max(40),
});
const issueSchema = z.object({
  severity: z.enum(["minor", "major", "critical"]),
  segment: z.number().int().nonnegative(),
  sourceQuote: z.string().min(1).max(2000),
  targetQuote: z.string().min(1).max(2000),
  explanation: z.string().trim().min(1).max(1000),
  suggestion: z.string().trim().min(1).max(1000),
});
const reviewSchema = z.object({
  reviewedSegments: z.array(z.number().int().nonnegative()).max(MAX_QUALITY_SEGMENTS),
  issues: z.array(issueSchema).max(80),
});
const revisionSchema = z.array(z.object({
  segment: z.number().int().nonnegative(),
  translation: z.string().max(MAX_QUALITY_SOURCE_CHARS * 4),
})).max(MAX_QUALITY_SEGMENTS);
const usageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() });

export function validateAuthorProfile(value: unknown, sourceSample?: string): AuthorProfile {
  const parsed = profileSchema.safeParse(value);
  if (!parsed.success || (sourceSample !== undefined && parsed.data.glossary.some((entry) => !sourceSample.includes(entry.source)))) {
    throw new TranslationQualityError("INVALID_PROFILE", "The author profile was invalid. Please try again.");
  }
  return parsed.data;
}

export function validateQualityInput(input: QualityInput): void {
  if (!Array.isArray(input.texts) || input.texts.length === 0 || input.texts.length > MAX_QUALITY_SEGMENTS ||
    !input.texts.every((text) => typeof text === "string") ||
    !input.texts.some((text) => text.trim()) ||
    input.texts.reduce((sum, text) => sum + text.length, 0) > MAX_QUALITY_SOURCE_CHARS ||
    !/^[a-z]{2,3}$/i.test(input.sourceLanguage) || !/^[a-z]{2,3}$/i.test(input.targetLanguage) ||
    input.sourceLanguage.toLowerCase() === input.targetLanguage.toLowerCase() ||
    (input.authorGuidance !== undefined && (typeof input.authorGuidance !== "string" || input.authorGuidance.length > MAX_AUTHOR_GUIDANCE_CHARS))) {
    throw new TranslationQualityError("INVALID_INPUT", "Translation quality input exceeds the limits or has an invalid language pair.");
  }
}

export function assertTranslationSegments(source: string[], target: unknown): asserts target is string[] {
  if (!Array.isArray(target) || target.length !== source.length ||
    target.some((text, index) => typeof text !== "string" || Boolean(source[index].trim()) !== Boolean(text.trim())) ||
    target.reduce((sum, text) => sum + text.length, 0) > MAX_QUALITY_SOURCE_CHARS * 4) {
    throw new TranslationQualityError("INVALID_TRANSLATION", "Translation returned missing, empty, or unexpected segments. Please try again.");
  }
}

export function validateReviewerResult(source: string[], translations: string[], reviewer: QualityIssue["reviewer"], data: unknown): QualityIssue[] {
  const parsed = reviewSchema.safeParse(data);
  if (!parsed.success || parsed.data.reviewedSegments.length !== source.length ||
    new Set(parsed.data.reviewedSegments).size !== source.length ||
    parsed.data.reviewedSegments.some((segment) => segment >= source.length) ||
    parsed.data.issues.some((issue) => issue.segment >= source.length ||
      !source[issue.segment].includes(issue.sourceQuote) || !translations[issue.segment].includes(issue.targetQuote))) {
    throw new TranslationQualityError("INVALID_REVIEW", "Translation quality review was incomplete or could not be verified. Please try again.");
  }
  return parsed.data.issues.map((issue) => ({ ...issue, reviewer }));
}

function preserveBoundaryWhitespace(source: string, target: string): string {
  if (!source.trim()) return source;
  return `${source.match(/^\s*/)?.[0] ?? ""}${target.trim()}${source.match(/\s*$/)?.[0] ?? ""}`;
}

export async function runTranslationQuality(input: QualityInput, dependencies: QualityDependencies): Promise<QualityResult> {
  validateQualityInput(input);
  const usage = { inputTokens: 0, outputTokens: 0 };
  const checkCancellation = () => {
    if (input.signal?.aborted) throw new TranslationQualityError("CANCELLED", "Translation quality processing was cancelled or timed out.");
  };
  const call = async (task: () => Promise<QualityCallResult>, stage: "PROFILE" | "TRANSLATION" | "REVIEW" | "REVISION"): Promise<unknown> => {
    checkCancellation();
    try {
      const result = await task();
      checkCancellation();
      const tokens = usageSchema.safeParse(result.usage);
      if (!tokens.success) throw new TranslationQualityError(`INVALID_${stage}`, "Translation quality returned incomplete usage data. Please try again.");
      usage.inputTokens += tokens.data.inputTokens;
      usage.outputTokens += tokens.data.outputTokens;
      return result.data;
    } catch (error) {
      checkCancellation();
      if (error instanceof TranslationQualityError) throw error;
      throw new TranslationQualityError(`${stage}_UNAVAILABLE`, stage === "REVIEW"
        ? "Translation quality review is unavailable. Please try again."
        : "Translation quality processing is unavailable. Please try again.");
    }
  };

  checkCancellation();
  const profile = input.profile
    ? validateAuthorProfile(input.profile)
    : validateAuthorProfile(await call(() => dependencies.profile(input), "PROFILE"), input.texts.join("\n"));
  const initial = await call(() => dependencies.translate({ ...input, profile }), "TRANSLATION");
  assertTranslationSegments(input.texts, initial);
  let translations = initial.map((text, index) => preserveBoundaryWhitespace(input.texts[index], text));

  const review = async (): Promise<QualityIssue[]> => {
    // Separate calls and role assignment prevent a model from self-certifying
    // both disciplines in one response or relabelling its own issues.
    let firstFailure: unknown;
    const results = await Promise.allSettled((["fidelity", "style"] as const).map(async (reviewer) => {
      try {
        const data = await call(() => dependencies.review(reviewer, { ...input, profile, translations }), "REVIEW");
        return validateReviewerResult(input.texts, translations, reviewer, data);
      } catch (error) {
        firstFailure ??= error;
        dependencies.cancelReviews?.();
        throw error;
      }
    }));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw firstFailure ?? failed.reason;
    return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  };

  let issues = await review();
  let revisionCount = 0;
  const blocking = issues.filter((issue) => issue.severity !== "minor");
  if (blocking.length > 0) {
    const segments = [...new Set(blocking.map((issue) => issue.segment))].sort((a, b) => a - b);
    const data = await call(() => dependencies.revise({ ...input, profile, translations, issues: blocking, segments }), "REVISION");
    const parsed = revisionSchema.safeParse(data);
    if (!parsed.success || parsed.data.length !== segments.length ||
      new Set(parsed.data.map((entry) => entry.segment)).size !== segments.length ||
      parsed.data.some((entry) => !segments.includes(entry.segment))) {
      throw new TranslationQualityError("INVALID_REVISION", "Translation revision changed unexpected segments or was incomplete. Please try again.");
    }
    // Only flagged segments can be replaced. Formatting runs and every other
    // translated segment retain their positions and exact string contents.
    translations = [...translations];
    for (const entry of parsed.data) translations[entry.segment] = preserveBoundaryWhitespace(input.texts[entry.segment], entry.translation);
    assertTranslationSegments(input.texts, translations);
    revisionCount = 1;
    issues = await review();
  }
  checkCancellation();
  return {
    translations,
    report: {
      status: issues.some((issue) => issue.severity !== "minor") ? "needs_review" : "checks_passed",
      profile, issues, revisionCount, reviewRounds: revisionCount + 1,
      model: QUALITY_MODEL, rubricVersion: QUALITY_RUBRIC_VERSION, usage,
    },
  };
}
