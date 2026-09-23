import type { MeterContext } from "@/lib/usage/types";
export type AuthorProfile = {
  voice: string;
  rhythm: string;
  dialogue: string;
  preserve: string[];
  glossary: Array<{ source: string; target: string }>;
};

export type QualityIssue = {
  reviewer: "fidelity" | "style";
  severity: "minor" | "major" | "critical";
  segment: number;
  sourceQuote: string;
  targetQuote: string;
  explanation: string;
  suggestion: string;
};

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type QualityReport = {
  status: "checks_passed" | "needs_review";
  profile: AuthorProfile;
  issues: QualityIssue[];
  revisionCount: number;
  reviewRounds: number;
  model: string;
  rubricVersion: string;
  usage: TokenUsage;
};

export type QualityResult = { translations: string[]; report: QualityReport };

export type UsageReceipt = TokenUsage & { stage: "PROFILE" | "TRANSLATION" | "REVIEW" | "REVISION"; model: string; cacheCreationTokens: number; cacheReadTokens: number };

export type QualityInput = {
  texts: string[];
  sourceLanguage: string;
  targetLanguage: string;
  profile?: AuthorProfile;
  authorGuidance?: string;
  signal?: AbortSignal;
  onUsage?: (receipt: UsageReceipt) => void | Promise<void>;
  /**
   * When present, token spend is billed to this user.
   *
   * Separate from `onUsage`: that receipt is the budget ledger and may throw
   * when it is missing; this is the cost record and must never throw.
   */
  meter?: MeterContext;
};

export const MAX_QUALITY_SOURCE_CHARS = 12_000;
export const MAX_QUALITY_SEGMENTS = 80;
export const MAX_AUTHOR_GUIDANCE_CHARS = 2_000;
export const MAX_PROFILE_SAMPLE_CHARS = 12_000;
export const QUALITY_MODEL = "claude-sonnet-5";
export const QUALITY_RUBRIC_VERSION = "author-voice-v2";
