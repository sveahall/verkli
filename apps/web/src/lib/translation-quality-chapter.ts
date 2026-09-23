import { createHash } from "node:crypto";
import { translateWithQuality } from "./ai/translation-quality/anthropic";
import { assertTranslationSegments } from "./ai/translation-quality/pipeline";
import type { AuthorProfile, QualityInput } from "./ai/translation-quality/types";
import type { TranslationQualityBatch } from "./translation-quality-report";
import { extractPlainText } from "./book-translation";
import { prepareTranslationQualityChapter } from "./translation-quality-budget";
export { planTranslationQualityChapter } from "./translation-quality-budget";

export class TranslationNeedsReviewError extends Error {
  constructor() {
    super("Translation needs editorial review. Substantive issues remain after one correction round. Open the saved quality report in the translation panel.");
    this.name = "TranslationNeedsReviewError";
  }
}

export function buildBookProfileSample(chapters: Array<{ content: string | null }>): string {
  const indices = [...new Set([0, Math.floor(chapters.length / 2), chapters.length - 1])];
  return indices.filter((i) => i >= 0).map((i) => extractPlainText(chapters[i]?.content).slice(0, 2000)).join("\n\n");
}

/** Keep document nodes/marks and original separators; only replace identified text. */
export async function translateQualityChapter(input: {
  chapterId: string;
  title: string;
  content: string;
  sourceLanguage: string;
  targetLanguage: string;
  profile: AuthorProfile;
  onUsage?: QualityInput["onUsage"];
  onBatch: (batch: TranslationQualityBatch) => Promise<void>;
}): Promise<{ title: string; content: string }> {
  const prepared = prepareTranslationQualityChapter(input);
  for (const [batchIndex, batch] of prepared.plan.batches.entries()) {
    const source = batch.texts;
    const offset = batch.segmentOffset;
    const result = await translateWithQuality({ texts: source, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, profile: input.profile, onUsage: input.onUsage });
    assertTranslationSegments(source, result.translations);
    await input.onBatch({ chapterId: input.chapterId, chapterTitle: input.title, batchIndex, segmentOffset: offset, targetHash: createHash("sha256").update(JSON.stringify(result.translations)).digest("hex"), sourceHash: createHash("sha256").update(JSON.stringify(source)).digest("hex"), report: result.report });
    if (result.report.status !== "checks_passed") throw new TranslationNeedsReviewError();
    result.translations.forEach((translation, i) => prepared.replaceSegment(offset + i, translation));
  }
  return prepared.result();
}
