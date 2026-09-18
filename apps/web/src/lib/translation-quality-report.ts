import { createHash } from "node:crypto";
import type { AuthorProfile, QualityReport, TokenUsage, UsageReceipt } from "./ai/translation-quality/types";

export const TRANSLATION_QUALITY_JOB_KIND = "translation_quality";

export type TranslationQualityBatch = {
  chapterId: string;
  chapterTitle: string;
  batchIndex: number;
  sourceHash: string;
  targetHash: string;
  segmentOffset: number;
  report: QualityReport;
};

/** Versioned application payload stored in existing ai_jobs JSON, not a DB schema. */
export type TranslationQualityRecord = {
  formatVersion: 1;
  scope: "sample" | "book" | "chapter";
  sourceVersionId: string;
  targetVersionId: string | null;
  sourceHash: string;
  targetHash?: string;
  profileUsage?: TokenUsage;
  usageReceipts?: UsageReceipt[];
  status: "processing" | "checks_passed" | "needs_review" | "failed";
  profile: AuthorProfile | null;
  batches: TranslationQualityBatch[];
  checkedAt: string;
  error: string | null;
};

export type SavedTranslationQuality = {
  id: string;
  status: string;
  createdAt: string;
  output: TranslationQualityRecord | null;
  stale?: boolean | null;
  trusted?: boolean;
};

export function hashTranslationSource(rows: Array<{ id: string; title: string | null; content: string | null; order: number | null }>): string {
  return createHash("sha256").update(JSON.stringify(rows.map((row) => [row.id, row.title, row.content, row.order]))).digest("hex");
}

export function hashTranslationTarget(rows: Array<{ title: string | null; content: string | null; order: number | null }>): string {
  return createHash("sha256").update(JSON.stringify(rows.map((row) => [row.title, row.content, row.order]))).digest("hex");
}
