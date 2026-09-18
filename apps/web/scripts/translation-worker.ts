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
import { getProviderForPair } from "../src/lib/translation-pairs";
import { createAuthorProfile } from "../src/lib/ai/translation-quality/anthropic";
import { buildBookProfileSample, translateQualityChapter, TranslationNeedsReviewError } from "../src/lib/translation-quality-chapter";
import { hashTranslationSource, hashTranslationTarget, TRANSLATION_QUALITY_JOB_KIND, type TranslationQualityRecord } from "../src/lib/translation-quality-report";
import { estimateTranslationQualityBook, translationQualityReservationKey, TranslationQualityBudgetError } from "../src/lib/translation-quality-budget";
import type { Database, Json } from "../src/lib/supabase/types";
import { commitReviewedTranslation, isTranslationCommitReceipt, reviewedTranslationActivationReady, REVIEWED_TRANSLATION_PROTOCOL, TranslationOutcomeUnknownError, type TranslationCommitRequest } from "../src/lib/translation-commit";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguageOrNull } from "../src/lib/languages";
import {
  checkBudget,
  BudgetExceededError,
  JobCostExceededError,
  validateJobCost,
} from "../src/lib/workers/budget";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.TRANSLATION;
const PIPELINE_SMOKE_MODE = process.env.PIPELINE_SMOKE_MODE === "true";

// A quality failure is terminal: retrying an entire paid book cannot improve a
// completed review decision, and must not refund already consumed model work.
export class TranslationQualityStoppedError extends UnrecoverableError {
  constructor(message: string) { super(message); this.name = "TranslationQualityStoppedError"; }
}

function structuredLog(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
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
  if (!reviewedTranslationActivationReady()) throw new TranslationQualityStoppedError("Reviewed translation is awaiting the approved database rollout. No translation was started.");
  if (PIPELINE_SMOKE_MODE) throw new TranslationQualityStoppedError("Smoke output cannot be saved as a reviewed translation.");
  if (!workerJobId) throw new TranslationQualityStoppedError("Translation queue identity is missing. No translation was started.");
  if (payload.reviewedQueueProtocol !== REVIEWED_TRANSLATION_PROTOCOL ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(payload.reviewedRunId ?? "")) {
    throw new TranslationQualityStoppedError("This queued translation predates the approved rollout. Start a new translation to continue.");
  }
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
  let jobRevision: string | null = null;
  let budgetUserId: string | null = null;
  let commitAttempted = false;
  let qualityJobId: string | null = null;
  let qualityRecord: TranslationQualityRecord | null = null;
  let qualityStarted = false;
  let preflightOwned = false;
  let ledgerAttempted = false;
  let reportWrite = Promise.resolve();
  function ownedJob(values: Database["public"]["Tables"]["ai_jobs"]["Update"]) {
    return supabase.from("ai_jobs").update(values).eq("id", qualityJobId!).eq("user_id", budgetUserId!)
      .eq("book_id", bookId).eq("book_version_id", resolvedTargetVersionId!)
      .eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("input->>protocol", REVIEWED_TRANSLATION_PROTOCOL)
      .eq("input->>sourceVersionId", sourceVersionId).eq("input->>reservationKey", workerJobId!)
      .eq("input->>targetClaimMarker", targetClaimMarker!).eq("status", "processing").eq("updated_at", jobRevision!);
  }
  function saveQualityReport() {
    const snapshot = structuredClone(qualityRecord);
    reportWrite = reportWrite.then(async () => {
      if (!qualityJobId || !snapshot || !jobRevision) throw new Error("Translation ledger identity is unavailable.");
      const { data, error } = await ownedJob({ output: snapshot as unknown as Json, progress: translationProgress })
        .select("id, updated_at").maybeSingle();
      if (error || !data?.updated_at) throw new Error("Could not durably save translation review usage. No further model work was started.");
      jobRevision = data.updated_at;
    });
    return reportWrite;
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
    const { data: book, error: bookFetchError } = await supabase
      .from("books")
      .select("id, title, slug, author_id, original_language, language, deleted_at")
      .eq("id", bookId).is("deleted_at", null)
      .single();

    if (bookFetchError || !book) {
      throw new UnrecoverableError(bookFetchError?.message ?? "Book not found");
    }

    // Auth isolation: verify payload authorId matches book owner
    if (payload.authorId && book.author_id !== payload.authorId) {
      throw new UnrecoverableError("Ownership mismatch: authorId does not match book owner");
    }

    budgetUserId = payload.authorId ?? book.author_id;
    if (!budgetUserId) throw new TranslationQualityStoppedError("Missing translation owner.");
    // The UUID was minted atomically with the trusted service queue entry.
    // Stalled handlers share it and can never replace another handler's identity.
    const { data: boundRun, error: boundRunError } = await supabase.from("ai_jobs")
      .select("id").eq("id", payload.reviewedRunId!).maybeSingle();
    if (boundRunError) throw new TranslationOutcomeUnknownError();
    if (boundRun) return await recoverTranslationRun(supabase, payload, workerJobId, budgetUserId);
    const { data: previousRuns, error: previousRunError } = await supabase.from("ai_jobs")
      .select("id").eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("input->>reservationKey", workerJobId).limit(1);
    if (previousRunError || previousRuns?.length) throw new TranslationOutcomeUnknownError();
    preflightOwned = true;

    const { data: sourceVersion, error: sourceVersionError } = await supabase
      .from("book_versions")
      .select("id, book_id, language_code, visibility, updated_at")
      .eq("id", sourceVersionId)
      .single();

    if (sourceVersionError || !sourceVersion) {
      throw new UnrecoverableError(sourceVersionError?.message ?? "Source version not found");
    }
    if (!sourceVersion.updated_at) throw new TranslationQualityStoppedError("Could not read the source edition revision.");
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
    resolvedTargetVersionId = targetSnapshot.id;
    if (targetSnapshot.published_at) throw new UnrecoverableError("This translation is published. Unpublish the target edition before replacing its text.");
    if (targetSnapshot.status === "translating") throw new UnrecoverableError("A translation is already running for this edition. Wait for it to finish before starting another.");
    if (!targetSnapshot.updated_at || !targetSnapshot.status) throw new UnrecoverableError("Could not read the target edition revision. No translation was started.");

    let chaptersQuery = supabase
      .from("chapters")
      .select("id, title, content, order, updated_at, version_number, deleted_at")
      .eq("book_id", bookId).eq("book_version_id", sourceVersionId).is("deleted_at", null)
      .order("order", { ascending: true });
    if (selectedChapterId) {
      chaptersQuery = chaptersQuery.eq("id", selectedChapterId);
    }
    const { data: chapters, error: chaptersError } = await chaptersQuery;

    if (chaptersError) {
      throw new Error(chaptersError.message);
    }

    const chapterList = chapters ?? [];
    if (chapterList.some((row) => !row.updated_at || !Number.isSafeInteger(row.version_number))) throw new TranslationQualityStoppedError("Could not read the source chapter revisions.");
    if (chapterList.length === 0) {
      throw new UnrecoverableError("No chapters found to translate");
    }

    const targetChapterFields = "id, title, content, order, updated_at, version_number, deleted_at";
    const readTargetSnapshot = () => {
      let query = supabase.from("chapters").select(targetChapterFields)
        .eq("book_id", bookId).eq("book_version_id", resolvedTargetVersionId!)
        .order("order", { ascending: true });
      if (selectedChapterId) query = query.eq("order", chapterList[0].order);
      return query;
    };
    const { data: targetBaseline, error: baselineError } = await readTargetSnapshot();
    if (baselineError || !targetBaseline || targetBaseline.some((row) => row.deleted_at !== null || !row.updated_at || !Number.isSafeInteger(row.version_number))) {
      throw new UnrecoverableError("Could not read the target manuscript revision. No model work was started.");
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
    qualityJobId = payload.reviewedRunId!;
    targetClaimMarker = `translation-claim:${qualityJobId}`;
    qualityRecord = {
      formatVersion: 1, scope: selectedChapterId ? "chapter" : "book",
      sourceVersionId, targetVersionId: resolvedTargetVersionId,
      sourceHash: hashTranslationSource(chapterList), status: "processing", profile: null,
      batches: [], usageReceipts: [], checkedAt: new Date().toISOString(), error: null,
    };
    ledgerAttempted = true;
    let ledgerResult;
    try {
      ledgerResult = await supabase.from("ai_jobs").insert({
        id: qualityJobId, user_id: budgetUserId, book_id: bookId,
        book_version_id: resolvedTargetVersionId, kind: TRANSLATION_QUALITY_JOB_KIND,
        language: normalizedTarget, status: "processing", started_at: new Date().toISOString(),
        input: { protocol: REVIEWED_TRANSLATION_PROTOCOL, sourceVersionId, sourceHash: qualityRecord.sourceHash,
          scope: qualityRecord.scope, reservationKey: workerJobId, targetClaimMarker, chapterId: selectedChapterId, overwrite: overwrite === true },
        output: qualityRecord as unknown as Json,
      }).select("id, updated_at").single();
    } catch { throw new TranslationOutcomeUnknownError(); }
    const { data: createdJob, error: reportError } = ledgerResult;
    if (reportError || !createdJob?.updated_at) throw new TranslationOutcomeUnknownError();
    jobRevision = createdJob.updated_at;

    // Only the unique ledger insertion winner may reserve its captured plan.
    // A stalled duplicate must not seed an idempotent marker for a different plan.
    try {
      // Count actual batches, including fragmented formatting runs. Character
      // count alone cannot bound the number of reviewer calls.
      const estimate = estimateTranslationQualityBook(chapterList);
      validateJobCost({
        userId: budgetUserId,
        pipeline: "translation",
        jobSize: estimate.sourceChars,
        jobId: workerJobId ?? null,
      });
      await checkBudget({
        userId: budgetUserId,
        pipeline: "translation",
        units: estimate.estimatedCostUnits,
        jobId: workerJobId ?? null,
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        throw new UnrecoverableError("This reviewed translation exceeds the remaining daily AI allowance. Try fewer chapters or try again after the daily reset.");
      }
      if (err instanceof JobCostExceededError || err instanceof TranslationQualityBudgetError) throw new UnrecoverableError(err.message);
      throw err;
    }

    // Claim exactly the unpublished edition inspected above. Publish uses the
    // same status/revision boundary, so only one operation can win.
    let claimResult;
    try {
      claimResult = await supabase.from("book_versions")
        .update({ status: "translating", error_message: targetClaimMarker })
        .eq("id", resolvedTargetVersionId).eq("book_id", bookId)
        .eq("status", targetSnapshot.status).eq("updated_at", targetSnapshot.updated_at)
        .is("published_at", null).select("id, updated_at").maybeSingle();
    } catch { throw new TranslationOutcomeUnknownError(); }
    const { data: claim, error: startError } = claimResult;
    if (startError || (claim && !claim.updated_at)) throw new TranslationOutcomeUnknownError();
    if (!claim) throw new UnrecoverableError("The target edition changed or was published before translation started. Refresh and try again.");
    targetClaimRevision = claim.updated_at;

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

      if (sourceContent.trim() || translatedTitle.trim()) {
        try {
            if (!qualityRecord?.profile) throw new Error("The author profile is unavailable. Translation was not reviewed.");
            const result = await translateQualityChapter({
              chapterId: ch.id, title: translatedTitle, content: sourceContent,
              sourceLanguage: sourceLang, targetLanguage: normalizedTarget,
              profile: qualityRecord.profile,
              onUsage: async (receipt) => { qualityRecord!.usageReceipts!.push(receipt); await saveQualityReport(); },
              onBatch: async (batch) => {
                qualityRecord!.batches.push(batch);
                await saveQualityReport();
              },
            });
            translatedContent = result.content;
            translatedTitle = result.title;
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

      translationProgress = Math.min(95, Math.round(((i + 1) / chapterList.length) * 95));
      await saveQualityReport();

      structuredLog("chapter_translation_completed", {
        chapterId: ch.id,
        chapterOrder: ch.order,
        sourceChars: sourceContent.length,
        translatedChars: translatedContent.length,
      });
    }

    await reportWrite;
    await saveQualityReport();
    const { data: persistedJob, error: persistedError } = await supabase.from("ai_jobs")
      .select("id, output, updated_at").eq("id", qualityJobId).eq("user_id", budgetUserId)
      .eq("book_id", bookId).eq("book_version_id", resolvedTargetVersionId).eq("kind", TRANSLATION_QUALITY_JOB_KIND)
      .eq("input->>targetClaimMarker", targetClaimMarker).eq("input->>reservationKey", workerJobId)
      .eq("status", "processing").eq("updated_at", jobRevision!).single();
    if (persistedError || !persistedJob?.updated_at || !qualityRecord) throw new TranslationOutcomeUnknownError();
    const finalReport = { ...(persistedJob.output as unknown as TranslationQualityRecord), status: "checks_passed" as const,
      checkedAt: new Date().toISOString(), targetHash: hashTranslationTarget(reviewedTargets) };
    // JSON clone detaches every nested payload from report callbacks. Nothing is
    // persisted or recomputed after this immutable request reaches the RPC.
    const frozenRequest: TranslationCommitRequest = JSON.parse(JSON.stringify({
      p_book_id: bookId, p_author_id: budgetUserId, p_source_version_id: sourceVersionId,
      p_target_version_id: resolvedTargetVersionId, p_claim_marker: targetClaimMarker, p_claim_revision: targetClaimRevision,
      p_expected_source: chapterList, p_expected_target: targetBaseline, p_chapters: pendingChapters,
      p_scope: selectedChapterId ? "chapter" : "book", p_overwrite: overwrite === true,
      p_source_revision: sourceVersion.updated_at, p_job_id: qualityJobId, p_job_revision: persistedJob.updated_at,
      p_final_report: finalReport,
    }));
    commitAttempted = true;
    // Local adapter only: generated Supabase types stay untouched until the approved migration.
    await commitReviewedTranslation(supabase as unknown as Parameters<typeof commitReviewedTranslation>[0], frozenRequest);

    structuredLog("translation_job_completed", {
      bookId,
      targetVersionId: resolvedTargetVersionId,
      chapterCount: chapterList.length,
      totalChars,
    });
  } catch (err) {
    await reportWrite.catch(() => {});
    if (err instanceof TranslationOutcomeUnknownError) {
      console.warn("[translation commit] outcome pending", { bookId, qualityJobId });
      throw new TranslationQualityStoppedError(err.message);
    }
    const msg = err instanceof TranslationNeedsReviewError || err instanceof UnrecoverableError || commitAttempted
      ? (err as Error).message : "Translation review could not be completed. Open the saved report for details.";
    // Preflight failure can win only an INSERT of this queue UUID. A stale
    // handler must never update the ledger created by another execution.
    try {
      if (preflightOwned && !ledgerAttempted && err instanceof UnrecoverableError) {
        const failedReport: TranslationQualityRecord = {
          formatVersion: 1, scope: selectedChapterId ? "chapter" : "book", sourceVersionId,
          targetVersionId: resolvedTargetVersionId, sourceHash: hashTranslationSource([]),
          status: "failed", profile: null, batches: [], usageReceipts: [], checkedAt: new Date().toISOString(), error: msg,
        };
        const { error } = await supabase.from("ai_jobs").insert({
          id: payload.reviewedRunId!, user_id: budgetUserId!, book_id: bookId, book_version_id: resolvedTargetVersionId,
          kind: TRANSLATION_QUALITY_JOB_KIND, language: normalizeLanguageOrNull(targetLanguage), status: "failed",
          error: msg, finished_at: failedReport.checkedAt,
          input: { protocol: REVIEWED_TRANSLATION_PROTOCOL, sourceVersionId, sourceHash: failedReport.sourceHash,
            scope: failedReport.scope, reservationKey: workerJobId, targetClaimMarker: `translation-claim:${payload.reviewedRunId}`,
            chapterId: selectedChapterId, overwrite: overwrite === true },
          output: failedReport as unknown as Json,
        });
        if (error) console.warn("[translation quality] preflight report not inserted", { bookId, code: error.code });
      } else if (!qualityStarted && !targetClaimRevision && qualityRecord && jobRevision) {
        // This execution owns the ledger, has not called a model, and either has
        // not attempted the edition claim or received a definitive CAS no-match.
        // Unknown insert/claim responses return above and never reach this CAS.
        const { error } = await ownedJob({ status: "failed", error: msg, finished_at: new Date().toISOString(),
          output: { ...qualityRecord, status: "failed", error: msg } as unknown as Json });
        if (error) console.error("[translation quality] pre-model report unavailable", { bookId, qualityJobId, code: error.code });
      } else if (resolvedTargetVersionId && targetClaimRevision && qualityRecord && jobRevision) {
        // After a claim, parent CAS precedes ledger CAS. An RPC winner or an
        // ambiguous parent write never authorizes a terminal ledger overwrite.
        const { data: failedVersion, error } = await supabase.from("book_versions")
          .update({ status: "failed", error_message: msg.slice(0, 500) })
          .eq("id", resolvedTargetVersionId).eq("book_id", bookId).eq("status", "translating")
          .eq("error_message", targetClaimMarker!).eq("updated_at", targetClaimRevision).is("published_at", null)
          .select("id").maybeSingle();
        if (!error && failedVersion) {
          const output = { ...qualityRecord, status: err instanceof TranslationNeedsReviewError ? "needs_review" : "failed", error: msg };
          const { error: reportError } = await ownedJob({ status: "failed", error: msg,
            finished_at: new Date().toISOString(), output: output as unknown as Json });
          if (reportError) console.error("[translation quality] terminal report unavailable", { bookId, qualityJobId, code: reportError.code });
        }
      }
    } catch { console.error("[translation quality] terminal state unavailable", { bookId, qualityJobId }); }
    console.error("[translation worker] stopped", { bookId, qualityJobId, qualityStarted });
    throw new TranslationQualityStoppedError(msg);
  }
}

/** Restart proof comes from the service-controlled queue UUID, never a legacy ledger timestamp. */
async function recoverTranslationRun(admin: ReturnType<typeof createAdminClient>, payload: TranslationJobData, reservationKey: string, authorId: string) {
  const { data: run, error } = await admin.from("ai_jobs").select("id, user_id, book_id, book_version_id, status, input, output")
    .eq("id", payload.reviewedRunId!).eq("kind", TRANSLATION_QUALITY_JOB_KIND).eq("user_id", authorId)
    .eq("book_id", payload.bookId).eq("input->>sourceVersionId", payload.sourceVersionId)
    .eq("input->>reservationKey", reservationKey).eq("input->>protocol", REVIEWED_TRANSLATION_PROTOCOL).maybeSingle();
  const input = run?.input as Record<string, unknown> | null;
  const output = run?.output as (TranslationQualityRecord & { _translationCommit?: { requestDigest?: string; receipt?: unknown } }) | null;
  const targetId = run?.book_version_id;
  const marker = `translation-claim:${payload.reviewedRunId}`;
  if (error || !run || (targetId && payload.targetVersionId && targetId !== payload.targetVersionId) ||
      input?.targetClaimMarker !== marker || input.scope !== (payload.chapterId ? "chapter" : "book") ||
      input.chapterId !== (payload.chapterId?.trim() || null) || input.overwrite !== (payload.overwrite === true)) throw new TranslationOutcomeUnknownError();
  if (run.status === "failed") throw new TranslationQualityStoppedError("This translation run already stopped. Open its saved report before starting another.");
  if (targetId && run.status === "completed" && output?.status === "checks_passed" && output.sourceVersionId === payload.sourceVersionId &&
      output.targetVersionId === targetId && output.scope === input.scope && output.sourceHash === input.sourceHash &&
      /^[a-f0-9]{64}$/.test(output._translationCommit?.requestDigest ?? "") &&
      isTranslationCommitReceipt(output._translationCommit?.receipt, run.id, targetId)) {
    console.log("[translation commit] recovered historical receipt", { jobId: run.id, targetVersionId: targetId });
    return;
  }
  throw new TranslationOutcomeUnknownError();
}

/** A stalled or failed queue job is not evidence that its database transaction failed. */
export async function reconcileFailedTranslation(job: Job | undefined, err: Error): Promise<void> {
  if (!job?.data?.reviewedRunId || job.data.reviewedQueueProtocol !== REVIEWED_TRANSLATION_PROTOCOL) return;
  try {
    const payload = job.data as TranslationJobData;
    if (!payload.authorId) return;
    await recoverTranslationRun(createAdminClient(), payload, translationQualityReservationKey(job), payload.authorId);
  } catch {
    console.warn("[translation commit] recovery pending; no refund or status overwrite", { queueJobId: job.id, errorType: err.name });
  }
}

function main() {
  if (!reviewedTranslationActivationReady()) { console.warn("[translation worker] paused pending approved database rollout"); return; }
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
