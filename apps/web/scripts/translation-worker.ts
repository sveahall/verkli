/**
 * BullMQ worker: translate books with source-grounded fidelity and voice reviews.
 * Run from apps/web: npm run translate-worker (Redis, Supabase and Anthropic required).
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { TranslationJobData } from "../src/lib/translation-queue";
import { randomUUID } from "node:crypto";
import { getProviderForPair } from "../src/lib/translation-pairs";
import { createAuthorProfile } from "../src/lib/ai/translation-quality/anthropic";
import { buildBookProfileSample, translateQualityChapter, TranslationNeedsReviewError } from "../src/lib/translation-quality-chapter";
import { hashTranslationSource, hashTranslationTarget, TRANSLATION_QUALITY_JOB_KIND, type TranslationQualityRecord } from "../src/lib/translation-quality-report";
import { estimateTranslationQualityBook, translationQualityReservationKey, TranslationQualityBudgetError } from "../src/lib/translation-quality-budget";
import type { Json } from "../src/lib/supabase/types";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguageOrNull } from "../src/lib/languages";
import { upsertBookTranslationState } from "../src/lib/book-translation";
import { isDuplicate } from "../src/lib/workers/idempotency";
import {
  checkBudget,
  releaseBudget,
  BudgetExceededError,
  JobCostExceededError,
  validateJobCost,
} from "../src/lib/workers/budget";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.TRANSLATION;
const PIPELINE_SMOKE_MODE = process.env.PIPELINE_SMOKE_MODE === "true";

function translateSmokeText(text: string, targetLanguage: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const normalizedTarget = targetLanguage.trim().toLowerCase();
  return `[smoke:${normalizedTarget}] ${trimmed}`;
}

// A quality failure is terminal: retrying an entire paid book cannot improve a
// completed review decision, and must not refund already consumed model work.
export class TranslationQualityStoppedError extends UnrecoverableError {
  constructor(message: string) { super(message); this.name = "TranslationQualityStoppedError"; }
}

function structuredLog(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

/**
 * Collect all text strings from a TipTap JSON node in document order.
 */
function collectTiptapTexts(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return [n.text];
  if (Array.isArray(n.content)) {
    const texts: string[] = [];
    for (const child of n.content) {
      texts.push(...collectTiptapTexts(child));
    }
    return texts;
  }
  return [];
}

/**
 * Replace text nodes in a TipTap JSON node with translations in document order.
 */
function replaceTiptapTexts(
  node: unknown,
  translations: string[],
  cursor: { i: number },
): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") {
    const translated = translations[cursor.i] ?? n.text;
    cursor.i++;
    return { ...n, text: translated };
  }
  if (Array.isArray(n.content)) {
    return {
      ...n,
      content: n.content.map((child) => replaceTiptapTexts(child, translations, cursor)),
    };
  }
  return node;
}

/**
 * Extract plain text from a TipTap JSON node (for display/debugging).
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(extractText).join("");
  }
  return "";
}

/**
 * Check if content looks like TipTap JSON (starts with {"type": or similar).
 */
function isTiptapJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && "type" in parsed;
  } catch {
    return false;
  }
}

function assertWorkerEnv(): void {
  try {
    assertServerEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[translation worker] ${msg}`);
    process.exit(1);
  }
}

function assertQualityProviderEnv(): void {
  if (PIPELINE_SMOKE_MODE) {
    console.warn("[translation worker] PIPELINE_SMOKE_MODE=true — smoke translations are not quality-reviewed.");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("[translation worker] ANTHROPIC_API_KEY is required for reviewed translations.");
    process.exit(1);
  }
}

export async function processJob(payload: TranslationJobData, workerJobId?: string) {
  const {
    bookId,
    sourceVersionId,
    targetLanguage,
    targetVersionId,
    overwrite,
    chapterId,
  } = payload;
  const supabase = createAdminClient();
  let resolvedTargetVersionId: string | null = null;
  let translationProgress = 0;
  let qualityJobId: string | null = null;
  let qualityRecord: TranslationQualityRecord | null = null;
  let qualityStarted = false;
  async function saveQualityReport() {
    if (!qualityJobId || !qualityRecord) return;
    const terminal = qualityRecord.status !== "processing";
    const { error } = await supabase.from("ai_jobs").update({
      output: qualityRecord as unknown as Json,
      status: qualityRecord.status === "failed" ? "failed" : terminal ? "completed" : "processing",
      progress: translationProgress,
      error: qualityRecord.error,
      ...(terminal ? { finished_at: new Date().toISOString() } : {}),
    }).eq("id", qualityJobId);
    if (error) throw new Error("Could not save the translation quality report.");
  }
  const selectedChapterId =
    typeof chapterId === "string" && chapterId.trim().length > 0 ? chapterId.trim() : null;

  console.log(
    "[translation worker] job received — bookId:",
    bookId,
    "sourceVersionId:",
    sourceVersionId,
    "targetLanguage:",
    targetLanguage,
    "scope:",
    selectedChapterId ? "chapter" : "book",
    selectedChapterId ? `chapterId: ${selectedChapterId}` : ""
  );

  try {
    // Processor-level dedupe: skip if translation version already exists with chapters
    // (unless overwrite is requested)
    if (!overwrite && !selectedChapterId) {
      const normalizedTargetForDedupe = normalizeLanguageOrNull(targetLanguage);
      const alreadyDone = await isDuplicate(async () => {
        if (!normalizedTargetForDedupe) return false;
        const { data: existingVersion } = await supabase
          .from("book_versions")
          .select("id, status")
          .eq("book_id", bookId)
          .eq("language_code", normalizedTargetForDedupe)
          .maybeSingle();
        if (!existingVersion || existingVersion.status !== "done") return false;
        const { count } = await supabase
          .from("chapters")
          .select("id", { count: "exact", head: true })
          .eq("book_version_id", existingVersion.id);
        return (count ?? 0) > 0;
      }, `translation:${bookId}:${targetLanguage}`);

      if (alreadyDone) {
        console.log("[translation worker] dedupe skip — translation already done");
        return;
      }
    }

    const { data: book, error: bookFetchError } = await supabase
      .from("books")
      .select("id, title, slug, author_id, original_language, language")
      .eq("id", bookId)
      .single();

    if (bookFetchError || !book) {
      throw new UnrecoverableError(bookFetchError?.message ?? "Book not found");
    }

    // Auth isolation: verify payload authorId matches book owner
    if (payload.authorId && book.author_id !== payload.authorId) {
      throw new UnrecoverableError("Ownership mismatch: authorId does not match book owner");
    }

    const { data: sourceVersion, error: sourceVersionError } = await supabase
      .from("book_versions")
      .select("id, book_id, language_code, visibility")
      .eq("id", sourceVersionId)
      .single();

    if (sourceVersionError || !sourceVersion) {
      throw new UnrecoverableError(sourceVersionError?.message ?? "Source version not found");
    }
    if (sourceVersion.book_id !== bookId) {
      throw new UnrecoverableError("Source version does not belong to book");
    }

    const sourceLang =
      normalizeLanguageOrNull(payload.sourceLanguage) ??
      normalizeLanguageOrNull(sourceVersion.language_code) ??
      normalizeLanguageOrNull(book.original_language ?? null) ??
      normalizeLanguageOrNull(book.language ?? null);
    const normalizedTarget = normalizeLanguageOrNull(targetLanguage);

    if (!sourceLang) {
      throw new UnrecoverableError("Source language missing for translation job");
    }
    if (!normalizedTarget) {
      throw new UnrecoverableError("Target language missing or unsupported for translation job");
    }
    if (sourceLang === normalizedTarget || targetVersionId === sourceVersionId) {
      throw new UnrecoverableError("Choose a target version and language different from the original manuscript.");
    }

    const translationProvider = getProviderForPair(sourceLang, normalizedTarget);
    if (!translationProvider) {
      throw new UnrecoverableError(
        `Unsupported translation pair: ${sourceLang} -> ${normalizedTarget}`
      );
    }

    if (targetVersionId) {
      const { data: targetVersion, error: targetError } = await supabase
        .from("book_versions")
        .select("id, book_id, language_code, published_at")
        .eq("id", targetVersionId)
        .single();
      if (targetError || !targetVersion) {
        throw new Error(targetError?.message ?? "Target version not found");
      }
      if (targetVersion.book_id !== bookId) {
        throw new Error("Target version does not belong to book");
      }
      if (normalizeLanguageOrNull(targetVersion.language_code) !== normalizedTarget) {
        throw new Error("Target version language mismatch");
      }
      if (targetVersion.published_at) {
        throw new UnrecoverableError("This translation is published. Unpublish the target edition before replacing its text.");
      }
      resolvedTargetVersionId = targetVersion.id;
    } else {
      // Do not silently replace an existing public edition via the language upsert.
      const { data: existingTarget, error: existingTargetError } = await supabase
        .from("book_versions").select("id, published_at")
        .eq("book_id", bookId).eq("language_code", normalizedTarget).maybeSingle();
      if (existingTargetError) throw new Error("Could not check the target edition before translation.");
      if (existingTarget?.published_at) {
        throw new UnrecoverableError("This translation is published. Unpublish the target edition before replacing its text.");
      }
      const { data: targetVersion, error: targetError } = await supabase
        .from("book_versions")
        .upsert(
          {
            book_id: bookId,
            language_code: normalizedTarget,
            status: "translating",
            // Inherit the source's visibility rather than taking the column
            // default, which is "public". Translating a private draft used to
            // produce a public version — the book's own `published` flag kept
            // it out of discovery, so nothing leaked, but the author never
            // chose that and a second gate is not a decision.
            visibility: sourceVersion.visibility ?? "private",
          },
          { onConflict: "book_id,language_code" }
        )
        .select("id")
        .single();
      if (targetError || !targetVersion?.id) {
        throw new Error(targetError?.message ?? "Failed to create target version");
      }
      resolvedTargetVersionId = targetVersion.id;
    }

    if (!resolvedTargetVersionId) {
      throw new Error("Missing target version id");
    }

    const { error: startError } = await supabase
      .from("book_versions")
      .update({ status: "translating", error_message: null })
      .eq("id", resolvedTargetVersionId);
    if (startError) throw new Error("Could not start the translation. No model work was requested.");

    if (!selectedChapterId) {
      await upsertBookTranslationState(supabase, {
        bookId,
        language: normalizedTarget,
        status: "running",
        progress: 0,
      });
    }

    let chaptersQuery = supabase
      .from("chapters")
      .select("id, title, source_text, content, order")
      .eq("book_version_id", sourceVersionId)
      .order("order", { ascending: true });
    if (selectedChapterId) {
      chaptersQuery = chaptersQuery.eq("id", selectedChapterId);
    }
    const { data: chapters, error: chaptersError } = await chaptersQuery;

    if (chaptersError) {
      throw new Error(chaptersError.message);
    }

    const chapterList = chapters ?? [];
    if (chapterList.length === 0) {
      throw new UnrecoverableError("No chapters found to translate");
    }

    // Size the budget on the actual translatable text, not the raw stored
    // string. For TipTap chapters `content` is serialized JSON, so counting its
    // length billed JSON markup (node types, attrs, braces) as translatable
    // text — over-reserving budget and wrongly tripping the per-job char cap on
    // large-but-mostly-markup chapters. Mirror what is actually sent to the
    // providers (the extracted text nodes).
    const totalChars = chapterList.reduce((sum, ch) => {
      const content = (ch.content as string | null) ?? "";
      if (!content) return sum;
      if (isTiptapJson(content)) {
        try {
          return sum + extractText(JSON.parse(content)).length;
        } catch {
          return sum + content.length; // unparseable: be conservative
        }
      }
      return sum + content.length;
    }, 0);
    const budgetUserId = payload.authorId ?? book.author_id;
    if (!budgetUserId) {
      throw new UnrecoverableError("Missing authorId for translation budget enforcement");
    }
    try {
      // Count actual batches, including fragmented formatting runs. Character
      // count alone cannot bound the number of reviewer calls.
      const estimate = PIPELINE_SMOKE_MODE ? null : estimateTranslationQualityBook(chapterList);
      validateJobCost({
        userId: budgetUserId,
        pipeline: "translation",
        jobSize: estimate?.sourceChars ?? totalChars,
        jobId: workerJobId ?? null,
      });
      await checkBudget({
        userId: budgetUserId,
        pipeline: "translation",
        units: estimate?.estimatedCostUnits ?? Math.ceil(totalChars / 4),
        jobId: workerJobId ?? null,
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        throw new UnrecoverableError("This reviewed translation exceeds the remaining daily AI allowance. Try fewer chapters or try again after the daily reset.");
      }
      if (err instanceof JobCostExceededError || err instanceof TranslationQualityBudgetError) throw new UnrecoverableError(err.message);
      throw err;
    }

    structuredLog("translation_job_started", {
      bookId,
      sourceVersionId,
      targetLanguage: normalizedTarget,
      chapterCount: chapterList.length,
      totalChars,
      scope: selectedChapterId ? "chapter" : "book",
      provider: PIPELINE_SMOKE_MODE ? "smoke" : "anthropic",
    });

    const reviewedTargets: Array<{ title: string; content: string; order: number }> = [];
    const pendingChapters: Array<{ book_id: string; book_version_id: string; title: string; content: string; source_text: string; content_hash: string; order: number }> = [];
    if (!PIPELINE_SMOKE_MODE) {
      if (workerJobId) {
        const { data: previousRun, error: previousRunError } = await supabase.from("ai_jobs")
          .select("id, output").eq("user_id", budgetUserId).eq("kind", TRANSLATION_QUALITY_JOB_KIND)
          .eq("input->>reservationKey", workerJobId).limit(1).maybeSingle();
        if (previousRunError) throw new UnrecoverableError("Could not verify whether this translation already consumed AI work. Try again later.");
        if (previousRun) {
          qualityStarted = true;
          qualityJobId = previousRun.id;
          qualityRecord = previousRun.output as unknown as TranslationQualityRecord;
          throw new TranslationQualityStoppedError("This translation run was interrupted after review started. Its saved report is available. Start a new translation to continue.");
        }
      }
      qualityJobId = randomUUID();
      qualityRecord = {
        formatVersion: 1, scope: selectedChapterId ? "chapter" : "book",
        sourceVersionId, targetVersionId: resolvedTargetVersionId,
        sourceHash: hashTranslationSource(chapterList), status: "processing", profile: null,
        batches: [], checkedAt: new Date().toISOString(), error: null,
      };
      const { error: reportError } = await supabase.from("ai_jobs").insert({
        id: qualityJobId, user_id: budgetUserId, book_id: bookId,
        book_version_id: resolvedTargetVersionId, kind: TRANSLATION_QUALITY_JOB_KIND,
        language: normalizedTarget, status: "processing", started_at: new Date().toISOString(),
        input: { sourceVersionId, sourceHash: qualityRecord.sourceHash, scope: qualityRecord.scope, reservationKey: workerJobId ?? null },
        output: qualityRecord as unknown as Json,
      });
      if (reportError) throw new UnrecoverableError("Could not create the translation quality report. No review was started.");
      qualityStarted = true;
      qualityRecord.profile = await createAuthorProfile({ sourceSample: buildBookProfileSample(chapterList), sourceLanguage: sourceLang, targetLanguage: normalizedTarget }, (usage) => { qualityRecord!.profileUsage = usage; });
      await saveQualityReport();
    }

    for (let i = 0; i < chapterList.length; i++) {
      const ch = chapterList[i];
      const sourceContent = (ch.content as string | null) ?? "";
      let translatedContent = sourceContent;
      let translatedTitle = ch.title ?? `Chapter ${Number(ch.order ?? i) + 1}`;

      structuredLog("chapter_translation_started", {
        chapterId: ch.id,
        chapterOrder: ch.order,
        chapterIndex: i,
        totalChapters: chapterList.length,
        sourceChars: sourceContent.length,
      });

      if (sourceContent.trim() || (!PIPELINE_SMOKE_MODE && translatedTitle.trim())) {
        try {
          if (PIPELINE_SMOKE_MODE) {
            // Smoke mode: prefix text with smoke marker (no Opus MT)
            if (isTiptapJson(sourceContent)) {
              const parsed = JSON.parse(sourceContent);
              const texts = collectTiptapTexts(parsed);
              const translated = texts.map((t) => (t.trim() ? translateSmokeText(t, normalizedTarget) : t));
              translatedContent = JSON.stringify(replaceTiptapTexts(parsed, translated, { i: 0 }));
            } else {
              const paragraphs = sourceContent.split(/\n{2,}/);
              translatedContent = paragraphs
                .map((p) => (p.trim() ? translateSmokeText(p, normalizedTarget) : p))
                .join("\n\n");
            }
          } else {
            if (!qualityRecord?.profile) throw new Error("The author profile is unavailable. Translation was not reviewed.");
            const result = await translateQualityChapter({
              chapterId: ch.id, title: translatedTitle, content: sourceContent,
              sourceLanguage: sourceLang, targetLanguage: normalizedTarget,
              profile: qualityRecord.profile,
              onBatch: async (batch) => {
                qualityRecord!.batches.push(batch);
                if (batch.report.status === "needs_review") qualityRecord!.status = "needs_review";
                await saveQualityReport();
              },
            });
            translatedContent = result.content;
            translatedTitle = result.title;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          structuredLog("chapter_translation_failed", {
            chapterId: ch.id,
            chapterOrder: ch.order,
            error: msg.slice(0, 500),
          });
          const safeMessage = msg.slice(0, 500);
          await supabase
            .from("book_versions")
            .update({ status: "failed", error_message: safeMessage })
            .eq("id", resolvedTargetVersionId);
          throw err;
        }
      }

      // Stage the complete result. A later rejected chapter must leave the old
      // target text intact; upsert only after every required review has passed.
      pendingChapters.push({
          book_id: bookId,
          book_version_id: resolvedTargetVersionId,
          title: translatedTitle,
          content: translatedContent,
          source_text: sourceContent,
          content_hash: contentHash(translatedContent),
          order: Number(ch.order ?? i),
      });

      reviewedTargets.push({ title: translatedTitle, content: translatedContent, order: Number(ch.order ?? i) });

      if (!selectedChapterId) {
        translationProgress = Math.min(95, Math.round(((i + 1) / chapterList.length) * 95));
        await upsertBookTranslationState(supabase, {
          bookId,
          language: normalizedTarget,
          status: "running",
          progress: translationProgress,
        });
      }

      structuredLog("chapter_translation_completed", {
        chapterId: ch.id,
        chapterOrder: ch.order,
        sourceChars: sourceContent.length,
        translatedChars: translatedContent.length,
      });
    }

    if (qualityRecord) {
      let currentQuery = supabase.from("chapters").select("id, title, source_text, content, order")
        .eq("book_version_id", sourceVersionId).order("order", { ascending: true });
      if (selectedChapterId) currentQuery = currentQuery.eq("id", selectedChapterId);
      const { data: currentSource, error: currentError } = await currentQuery;
      if (currentError || !currentSource || hashTranslationSource(currentSource) !== qualityRecord.sourceHash) {
        throw new TranslationQualityStoppedError("The manuscript changed during translation. Review the current source and start a new translation.");
      }
    }

    // Recheck publication immediately before writing; readers must never see a
    // partially replaced published edition. Existing chapter IDs are preserved.
    const { data: targetBeforeWrite, error: targetBeforeWriteError } = await supabase
      .from("book_versions").select("published_at").eq("id", resolvedTargetVersionId).single();
    if (targetBeforeWriteError || !targetBeforeWrite || targetBeforeWrite.published_at) {
      throw new TranslationQualityStoppedError("The target edition is published or unavailable. No replacement was saved. Unpublish it before trying again.");
    }
    const { error: upsertError } = await supabase.from("chapters").upsert(pendingChapters, { onConflict: "book_version_id,order" });
    if (upsertError) throw new Error("Could not save the reviewed translation. The edition has not been marked complete.");
    if (overwrite && !selectedChapterId) {
      const keptOrders = pendingChapters.map((chapter) => chapter.order);
      const { error: deleteError } = await supabase.from("chapters").delete()
        .eq("book_version_id", resolvedTargetVersionId).not("order", "in", `(${keptOrders.join(",")})`);
      if (deleteError) throw new Error("Could not reconcile the translated chapters. The edition has not been marked complete.");
    }

    if (qualityRecord) {
      let targetQuery = supabase.from("chapters").select("title, content, order")
        .eq("book_version_id", resolvedTargetVersionId).order("order", { ascending: true });
      if (selectedChapterId) targetQuery = targetQuery.eq("order", reviewedTargets[0]?.order ?? -1);
      const { data: currentTarget, error: targetReadError } = await targetQuery;
      qualityRecord.targetHash = hashTranslationTarget(reviewedTargets);
      if (targetReadError || !currentTarget || hashTranslationTarget(currentTarget) !== qualityRecord.targetHash) {
        throw new TranslationQualityStoppedError("The translated manuscript changed during review. Its current text has not passed the saved checks. Start a new review.");
      }
      qualityRecord.status = "checks_passed";
      qualityRecord.checkedAt = new Date().toISOString();
      translationProgress = 100;
      await saveQualityReport();
    }

    const { error: completionError } = await supabase
      .from("book_versions")
      .update({ status: selectedChapterId ? "draft" : "done", error_message: null })
      .eq("id", resolvedTargetVersionId);
    if (completionError) throw new Error("Could not mark the reviewed translation complete.");

    if (!selectedChapterId) {
      await upsertBookTranslationState(supabase, {
        bookId,
        language: normalizedTarget,
        status: "completed",
        progress: 100,
      });
    }

    structuredLog("translation_job_completed", {
      bookId,
      targetVersionId: resolvedTargetVersionId,
      chapterCount: chapterList.length,
      totalChars,
    });
  } catch (err) {
    const msg = qualityStarted && !(err instanceof TranslationNeedsReviewError) && !(err instanceof TranslationQualityStoppedError)
      ? "Translation quality checks could not be completed. No quality approval was issued. Open the saved review and try again."
      : err instanceof Error ? err.message : "Translation failed.";
    if (qualityRecord) {
      qualityRecord.status = err instanceof TranslationNeedsReviewError ? "needs_review" : "failed";
      qualityRecord.error = msg;
      try { await saveQualityReport(); } catch { console.error("[translation quality] failed to persist terminal report", { bookId, qualityJobId }); }
    }
    console.error("[translation worker] failed — bookId:", bookId, "error:", msg);
    // Persistence outages must not replace the paid terminal error with a
    // retryable DB exception and restart the entire translation.
    try {
      if (resolvedTargetVersionId) {
        await supabase.from("book_versions")
          .update({ status: "failed", error_message: msg.slice(0, 500) })
          .eq("id", resolvedTargetVersionId);
      }
      if (!selectedChapterId) {
        const normalizedTarget = normalizeLanguageOrNull(targetLanguage);
        if (normalizedTarget) {
          await upsertBookTranslationState(supabase, {
            bookId, language: normalizedTarget, status: "failed", progress: translationProgress,
          });
        }
      }
    } catch {
      console.error("[translation quality] failed to persist terminal translation state", { bookId, qualityJobId });
    }
    if (qualityStarted) throw new TranslationQualityStoppedError(msg);
    throw err;
  }
}

function main() {
  assertWorkerEnv();
  assertQualityProviderEnv();

  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[translation worker] REDIS_URL not set. Set REDIS_URL and ensure Redis is running.");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[translation worker] Redis not reachable. Check REDIS_URL.");
    process.exit(1);
  }

  console.log("[translation-worker] started", {
    queue: QUEUE_NAME,
    redis: connection.host + ":" + connection.port,
    smokeMode: PIPELINE_SMOKE_MODE,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "translate" && job.data) {
        console.log("[translation-worker] processing job", job.id);
        const workerJobId = translationQualityReservationKey(job);
        await processJob(job.data as TranslationJobData, workerJobId);
      }
    },
    {
      connection: { ...connection },
      concurrency: 2,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[translation worker] job completed:", job.id);
  });
  worker.on("failed", (job, err) => {
    Sentry.captureException(err);
    console.error("[translation-worker] job failed", job?.id, err?.message);
    // Reconcile orphaned book_versions state. The in-process catch writes the
    // target version to "failed" before re-throwing, so an ordinary failure is
    // already terminal here. But on a hard-kill/stall the catch never runs and
    // the target version stays stuck "translating" forever. On a TERMINAL
    // failure (retries exhausted or stall-out), flip any still-"translating"
    // version for this book+language to "failed". The .eq("status","translating")
    // guard makes it idempotent and prevents clobbering a done/failed/running row.
    void (async () => {
      try {
        const data = job?.data as Partial<TranslationJobData> | undefined;
        const attempts = job?.opts?.attempts ?? 1;
        const made = job?.attemptsMade ?? 0;
        // Match BullMQ's exact stall-out message so an arbitrary error whose
        // text merely contains "stalled" cannot trip the terminal override.
        const stalledOut = /stalled more than allowable limit/i.test(err?.message ?? "");
        if (made < attempts && !stalledOut && !(err instanceof UnrecoverableError)) return; // not terminal — will retry
        // Preserve spent allowance even after a hard kill where the in-process
        // quality error wrapper never ran. Failure to read means no refund.
        const admin = createAdminClient();
        if (!(err instanceof TranslationQualityStoppedError)) {
          const reservationKey = job ? translationQualityReservationKey(job) : null;
          const { data: paidRun, error: paidRunError } = await admin.from("ai_jobs").select("id")
            .eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("input->>reservationKey", reservationKey ?? "").limit(1).maybeSingle();
          if (!paidRunError && !paidRun) await releaseBudget({ pipeline: "translation", jobId: reservationKey });
        }
        const bookId = data?.bookId;
        const normalizedLang = data?.targetLanguage
          ? normalizeLanguageOrNull(data.targetLanguage)
          : null;
        if (!bookId || !normalizedLang) return;
        const safeError =
          (err?.message ?? "").slice(0, 500) ||
          "Översättningen avbröts oväntat (servern startade om). Försök igen.";
        await admin
          .from("book_versions")
          .update({ status: "failed", error_message: safeError })
          .eq("book_id", bookId)
          .eq("language_code", normalizedLang)
          .eq("status", "translating");
        console.warn("[translation-worker] reconciled orphaned version to failed", {
          bookId,
          language: normalizedLang,
        });
      } catch (reconcileErr) {
        console.error("[translation-worker] failed-state reconciliation error", reconcileErr);
      }
    })();
  });
  worker.on("error", (err) => {
    console.error("[translation worker] Redis/queue error:", err.message);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

  worker.on("closed", () => clearInterval(heartbeatInterval));

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[translation worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[translation worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });
}

// The combined/start-workers launchers rely on registration when importing this
// module. Only unit tests import processJob without starting a queue consumer.
if (process.env.NODE_ENV !== "test") main();
