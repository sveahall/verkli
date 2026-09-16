/**
 * BullMQ worker: translate books with source-grounded fidelity and voice reviews.
 * Run from apps/web: npm run translate-worker (Redis, Supabase and Anthropic required).
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError, type Job } from "bullmq";
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
  let targetClaimRevision: string | null = null;
  let targetClaimMarker: string | null = null;
  let savedChapterCount = 0;
  let qualityJobId: string | null = null;
  let qualityRecord: TranslationQualityRecord | null = null;
  let qualityStarted = false;
  let reportWrite = Promise.resolve();
  function saveQualityReport() {
    reportWrite = reportWrite.then(persistQualityReport);
    return reportWrite;
  }
  async function persistQualityReport() {
    if (!qualityJobId || !qualityRecord) return;
    const terminal = qualityRecord.status !== "processing";
    const { data, error } = await supabase.from("ai_jobs").update({
      output: qualityRecord as unknown as Json,
      status: qualityRecord.status === "failed" ? "failed" : terminal ? "completed" : "processing",
      progress: translationProgress,
      error: qualityRecord.error,
      ...(terminal ? { finished_at: new Date().toISOString() } : {}),
    }).eq("id", qualityJobId).select("id").maybeSingle();
    if (error || !data) throw new Error("Could not save the translation quality report.");
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

    const targetFields = "id, book_id, language_code, published_at, status, updated_at";
    let targetQuery = supabase.from("book_versions").select(targetFields).eq("book_id", bookId);
    targetQuery = targetVersionId ? targetQuery.eq("id", targetVersionId) : targetQuery.eq("language_code", normalizedTarget);
    const { data: existingTarget, error: targetLookupError } = await targetQuery.maybeSingle();
    if (targetLookupError || (targetVersionId && !existingTarget)) throw new UnrecoverableError("Could not find the target edition in this book.");
    let targetSnapshot = existingTarget;
    if (!targetSnapshot) {
      // INSERT, never upsert: a concurrent new edition belongs to its creator.
      const { data: createdTarget, error: createError } = await supabase.from("book_versions").insert({
        book_id: bookId, language_code: normalizedTarget, status: "draft",
        visibility: sourceVersion.visibility ?? "private",
      }).select(targetFields).single();
      if (createError || !createdTarget) throw new UnrecoverableError("The target edition was created or changed elsewhere. Refresh before starting a new translation.");
      targetSnapshot = createdTarget;
    }
    if (normalizeLanguageOrNull(targetSnapshot.language_code) !== normalizedTarget) throw new UnrecoverableError("Target version language mismatch");
    if (targetSnapshot.published_at) throw new UnrecoverableError("This translation is published. Unpublish the target edition before replacing its text.");
    if (targetSnapshot.status === "translating") throw new UnrecoverableError("A translation is already running for this edition. Wait for it to finish before starting another.");
    if (!targetSnapshot.updated_at || !targetSnapshot.status) throw new UnrecoverableError("Could not read the target edition revision. No translation was started.");
    resolvedTargetVersionId = targetSnapshot.id;

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

    const targetChapterFields = "id, title, content, order, updated_at, version_number";
    const readTargetSnapshot = () => {
      let query = supabase.from("chapters").select(targetChapterFields)
        .eq("book_id", bookId).eq("book_version_id", resolvedTargetVersionId!)
        .order("order", { ascending: true });
      if (selectedChapterId) query = query.eq("order", chapterList[0].order);
      return query;
    };
    const { data: targetBaseline, error: baselineError } = await readTargetSnapshot();
    if (baselineError || !targetBaseline || targetBaseline.some((row) => !row.updated_at || !Number.isSafeInteger(row.version_number))) {
      throw new UnrecoverableError("Could not read the target manuscript revision. No model work was started.");
    }
    const targetSnapshotKey = (rows: typeof targetBaseline) => JSON.stringify(rows.map((row) => [row.id, row.title, row.content, row.order, row.updated_at, row.version_number]));

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
      targetClaimMarker = `translation-claim:${qualityJobId}`;
      qualityRecord = {
        formatVersion: 1, scope: selectedChapterId ? "chapter" : "book",
        sourceVersionId, targetVersionId: resolvedTargetVersionId,
        sourceHash: hashTranslationSource(chapterList), status: "processing", profile: null,
        batches: [], usageReceipts: [], checkedAt: new Date().toISOString(), error: null,
      };
      const { error: reportError } = await supabase.from("ai_jobs").insert({
        id: qualityJobId, user_id: budgetUserId, book_id: bookId,
        book_version_id: resolvedTargetVersionId, kind: TRANSLATION_QUALITY_JOB_KIND,
        language: normalizedTarget, status: "processing", started_at: new Date().toISOString(),
        input: { sourceVersionId, sourceHash: qualityRecord.sourceHash, scope: qualityRecord.scope, reservationKey: workerJobId ?? null, targetClaimMarker },
        output: qualityRecord as unknown as Json,
      });
      if (reportError) throw new UnrecoverableError("Could not create the translation quality report. No review was started.");
    } else {
      qualityJobId = randomUUID();
      targetClaimMarker = `translation-claim:${qualityJobId}`;
      const { error } = await supabase.from("ai_jobs").insert({
        id: qualityJobId, user_id: budgetUserId, book_id: bookId, book_version_id: resolvedTargetVersionId,
        kind: TRANSLATION_QUALITY_JOB_KIND, language: normalizedTarget, status: "processing",
        input: { reservationKey: workerJobId ?? null, targetClaimMarker, smoke: true },
      });
      if (error) throw new UnrecoverableError("Could not save the translation claim. No translation was started.");
    }

    // Claim exactly the unpublished edition inspected above. Publish uses the
    // same status/revision boundary, so only one operation can win.
    const { data: claim, error: startError } = await supabase.from("book_versions")
      .update({ status: "translating", error_message: targetClaimMarker })
      .eq("id", resolvedTargetVersionId).eq("book_id", bookId)
      .eq("status", targetSnapshot.status).eq("updated_at", targetSnapshot.updated_at)
      .is("published_at", null).select("id, updated_at").maybeSingle();
    if (startError || !claim?.updated_at) throw new UnrecoverableError("The target edition changed or was published before translation started. Refresh and try again.");
    targetClaimRevision = claim.updated_at;

    if (!selectedChapterId) {
      await upsertBookTranslationState(supabase, {
        bookId,
        language: normalizedTarget,
        status: "running",
        progress: 0,
      });
    }

    if (qualityRecord) {
      qualityStarted = true;
      qualityRecord.profile = await createAuthorProfile({ sourceSample: buildBookProfileSample(chapterList), sourceLanguage: sourceLang, targetLanguage: normalizedTarget }, async (usage) => { qualityRecord!.profileUsage = usage; qualityRecord!.usageReceipts!.push(usage); await saveQualityReport(); });
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
              onUsage: async (receipt) => { qualityRecord!.usageReceipts!.push(receipt); await saveQualityReport(); },
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
          throw err;
        }
      }

      // Stage the complete result. A later rejected chapter must leave the old
      // target text intact; write conditionally after every required review passes.
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

    // Reject any target change observed since BEFORE model work, including
    // newly created chapters. Per-row conditions below close the later race.
    const { data: currentTargetSnapshot, error: currentTargetError } = await readTargetSnapshot();
    if (currentTargetError || !currentTargetSnapshot || targetSnapshotKey(currentTargetSnapshot) !== targetSnapshotKey(targetBaseline)) {
      throw new TranslationQualityStoppedError("The target manuscript changed during translation. Your newer text was kept. Review it before starting again.");
    }
    const { data: targetBeforeWrite, error: targetBeforeWriteError } = await supabase
      .from("book_versions").select("published_at, status, updated_at").eq("id", resolvedTargetVersionId).single();
    if (targetBeforeWriteError || !targetBeforeWrite || targetBeforeWrite.published_at ||
        targetBeforeWrite.status !== "translating" || targetBeforeWrite.updated_at !== targetClaimRevision) {
      throw new TranslationQualityStoppedError("The target edition changed or became published. No replacement was saved.");
    }
    for (const next of pendingChapters) {
      const baseline = targetBaseline.find((row) => row.order === next.order);
      const write = baseline
        ? supabase.from("chapters").update(next).eq("id", baseline.id).eq("book_id", bookId)
            .eq("book_version_id", resolvedTargetVersionId).eq("version_number", baseline.version_number).eq("updated_at", baseline.updated_at)
        : supabase.from("chapters").insert(next);
      const { data: saved, error: writeError } = await write.select("id").maybeSingle();
      if (writeError || !saved) throw new TranslationQualityStoppedError(`The target chapter changed or could not be saved. ${savedChapterCount} reviewed chapters were saved; newer text was kept. Review the edition before retrying.`);
      savedChapterCount += 1;
    }
    if (overwrite && !selectedChapterId) {
      const keptOrders = new Set(pendingChapters.map((chapter) => chapter.order));
      for (const baseline of targetBaseline.filter((row) => !keptOrders.has(row.order))) {
        const { data: removed, error: deleteError } = await supabase.from("chapters").delete()
          .eq("book_id", bookId).eq("book_version_id", resolvedTargetVersionId).eq("id", baseline.id)
          .eq("version_number", baseline.version_number).eq("updated_at", baseline.updated_at).select("id").maybeSingle();
        if (deleteError || !removed) throw new TranslationQualityStoppedError(`A target chapter changed during reconciliation. ${savedChapterCount} reviewed chapters were saved; newer text was kept. Review the edition before retrying.`);
      }
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

    }

    const { data: completedVersion, error: completionError } = await supabase
      .from("book_versions")
      .update({ status: selectedChapterId ? "draft" : "done", error_message: null })
      .eq("id", resolvedTargetVersionId).eq("status", "translating").eq("error_message", targetClaimMarker!).eq("updated_at", targetClaimRevision!).is("published_at", null)
      .select("id").maybeSingle();
    if (completionError || !completedVersion) throw new TranslationQualityStoppedError("The edition changed before completion. Saved chapters remain, but the current edition has not been approved. Review it before retrying.");

    if (qualityRecord) {
      qualityRecord.status = "checks_passed";
      qualityRecord.checkedAt = new Date().toISOString();
      translationProgress = 100;
      await saveQualityReport();
    }

    if (PIPELINE_SMOKE_MODE && qualityJobId) {
      await supabase.from("ai_jobs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", qualityJobId);
    }
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
    await reportWrite.catch(() => {});
    reportWrite = Promise.resolve();
    if (qualityRecord) {
      qualityRecord.status = err instanceof TranslationNeedsReviewError ? "needs_review" : "failed";
      qualityRecord.error = msg;
      try { await saveQualityReport(); } catch { console.error("[translation quality] failed to persist terminal report", { bookId, qualityJobId }); }
    }
    console.error("[translation worker] failed — bookId:", bookId, "error:", msg);
    // Persistence outages must not replace the paid terminal error with a
    // retryable DB exception and restart the entire translation.
    try {
      if (resolvedTargetVersionId && targetClaimRevision) {
        const { data: failedVersion, error: failedError } = await supabase.from("book_versions")
          .update({ status: "failed", error_message: msg.slice(0, 500) })
          .eq("id", resolvedTargetVersionId).eq("status", "translating").eq("error_message", targetClaimMarker!).eq("updated_at", targetClaimRevision).is("published_at", null)
          .select("id").maybeSingle();
        if (!failedError && failedVersion && !selectedChapterId) {
          const normalizedTarget = normalizeLanguageOrNull(targetLanguage);
          if (normalizedTarget) await upsertBookTranslationState(supabase, {
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

/** A terminal job may reconcile only the exact version claim recorded by that job. */
export async function reconcileFailedTranslation(job: Job | undefined, err: Error): Promise<void> {
  try {
    const data = job?.data as Partial<TranslationJobData> | undefined;
    const attempts = job?.opts?.attempts ?? 1;
    const made = job?.attemptsMade ?? 0;
    const stalledOut = /stalled more than allowable limit/i.test(err.message);
    if (made < attempts && !stalledOut && !(err instanceof UnrecoverableError)) return;
    const reservationKey = job ? translationQualityReservationKey(job) : null;
    if (!reservationKey) return;
    const admin = createAdminClient();
    const { data: paidRun, error: paidRunError } = await admin.from("ai_jobs")
      .select("id, book_version_id, input, output").eq("kind", TRANSLATION_QUALITY_JOB_KIND)
      .eq("input->>reservationKey", reservationKey).limit(1).maybeSingle();
    // Unknown ledger state cannot authorize a refund or mutation of a version.
    if (paidRunError) throw new Error("Could not read the failed job's translation claim.");
    if (!paidRun) {
      if (!(err instanceof TranslationQualityStoppedError)) await releaseBudget({ pipeline: "translation", jobId: reservationKey });
      return;
    }
    const input = paidRun.input as Record<string, unknown> | null;
    const claimMarker = input?.targetClaimMarker;
    const bookId = data?.bookId;
    const language = data?.targetLanguage ? normalizeLanguageOrNull(data.targetLanguage) : null;
    if (!bookId || !language || !paidRun.book_version_id || typeof claimMarker !== "string" || !claimMarker.startsWith("translation-claim:")) return;
    const { data: reconciled, error } = await admin.from("book_versions")
      .update({ status: "failed", error_message: err.message.slice(0, 500) || "Translation stopped unexpectedly. Please try again." })
      .eq("id", paidRun.book_version_id).eq("book_id", bookId).eq("language_code", language)
      .eq("status", "translating").eq("error_message", claimMarker).is("published_at", null)
      .select("id").maybeSingle();
    if (error) throw error;
    const previousOutput = paidRun.output && typeof paidRun.output === "object" && !Array.isArray(paidRun.output) ? paidRun.output : {};
    const { error: reportError } = await admin.from("ai_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString(),
        error: "Translation stopped unexpectedly. Review the saved edition before retrying.",
        output: { ...previousOutput, status: "failed", error: "Translation stopped unexpectedly. Review the saved edition before retrying." } })
      .eq("id", paidRun.id).eq("status", "processing").eq("input->>targetClaimMarker", claimMarker);
    if (reportError) throw reportError;
    if (reconciled) console.warn("[translation-worker] reconciled orphaned version to failed", { bookId, language });
  } catch (error) {
    console.error("[translation-worker] failed-state reconciliation error", error);
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
    return reconcileFailedTranslation(job, err);
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
