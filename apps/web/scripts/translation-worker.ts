/**
 * BullMQ worker: process "translate" jobs for book translations (Opus MT / CTranslate2).
 * Run from apps/web: npm run translate-worker (requires REDIS_URL, Supabase env; Python venv and model in apps/web/models/sv_en)
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { TranslationJobData } from "../src/lib/translation-queue";
import { translateBatch, sanitizeTranslatedText } from "../src/lib/opus";
import { detectLanguageWithConfidence } from "../src/lib/language-detect";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguageOrNull } from "../src/lib/languages";
import { upsertBookTranslationState } from "../src/lib/book-translation";
import { isDuplicate } from "../src/lib/workers/idempotency";
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

function translateSmokeText(text: string, targetLanguage: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const normalizedTarget = targetLanguage.trim().toLowerCase();
  return `[smoke:${normalizedTarget}] ${trimmed}`;
}

/** Max chars per batch sent to Opus MT (~1500-2000 tokens for European languages). */
const MAX_BATCH_CHARS = 6000;
/** Per-chunk retry attempts with exponential backoff. */
const MAX_CHUNK_RETRY = 3;
const RETRY_BASE_DELAY_MS = 1000;

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
 * Group texts into batches where total chars per batch <= maxChars.
 * Each text is always kept whole (never split across batches).
 */
function batchByChars(texts: string[], maxChars: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    if (currentChars + text.length > maxChars && current.length > 0) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Translate a batch of texts with retry (3 attempts, exponential backoff).
 */
async function translateBatchWithRetry(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  chapterId: string,
  batchIndex: number,
): Promise<string[]> {
  for (let attempt = 1; attempt <= MAX_CHUNK_RETRY; attempt++) {
    try {
      const raw = translateBatch({ texts, sourceLanguage: sourceLang, targetLanguage: targetLang });
      return raw.map((t, i) => {
        const sanitized = sanitizeTranslatedText(t);
        if (!sanitized.trim() && texts[i].trim()) {
          structuredLog("chunk_item_empty_fallback", { chapterId, batchIndex, itemIndex: i });
          return texts[i];
        }
        return sanitized;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      structuredLog("chunk_translation_failed", {
        chapterId,
        batchIndex,
        attempt,
        maxAttempts: MAX_CHUNK_RETRY,
        error: msg.slice(0, 300),
      });
      if (attempt === MAX_CHUNK_RETRY) throw err;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("translateBatchWithRetry: unreachable");
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

function assertOpusEnv(): void {
  if (PIPELINE_SMOKE_MODE) {
    console.warn("[translation worker] PIPELINE_SMOKE_MODE=true — Opus MT binary checks are skipped.");
    return;
  }

  const missing: string[] = [];
  if (!process.env.OPUSMT_PYTHON?.trim()) missing.push("OPUSMT_PYTHON");
  if (!process.env.OPUSMT_MODELS_DIR?.trim()) missing.push("OPUSMT_MODELS_DIR");
  if (missing.length > 0) {
    console.error(
      `[translation worker] Missing required env: ${missing.join(", ")}. Set them in apps/web/.env.local.`
    );
    process.exit(1);
  }
}

async function processJob(payload: TranslationJobData, workerJobId?: string) {
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
      .select("id, book_id, language_code")
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

    if (targetVersionId) {
      const { data: targetVersion, error: targetError } = await supabase
        .from("book_versions")
        .select("id, book_id, language_code")
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
      resolvedTargetVersionId = targetVersion.id;
    } else {
      const { data: targetVersion, error: targetError } = await supabase
        .from("book_versions")
        .upsert(
          {
            book_id: bookId,
            language_code: normalizedTarget,
            status: "translating",
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

    await supabase
      .from("book_versions")
      .update({ status: "translating", error_message: null })
      .eq("id", resolvedTargetVersionId);

    if (!selectedChapterId) {
      await upsertBookTranslationState(supabase, {
        bookId,
        language: normalizedTarget,
        status: "running",
        progress: 0,
      });
    }

    if (overwrite) {
      if (selectedChapterId) {
        const { data: sourceChapterForDelete, error: sourceChapterForDeleteError } = await supabase
          .from("chapters")
          .select("order")
          .eq("book_version_id", sourceVersionId)
          .eq("id", selectedChapterId)
          .maybeSingle();
        if (sourceChapterForDeleteError || !sourceChapterForDelete) {
          throw new Error(sourceChapterForDeleteError?.message ?? "Selected source chapter not found");
        }
        await supabase
          .from("chapters")
          .delete()
          .eq("book_version_id", resolvedTargetVersionId)
          .eq("order", sourceChapterForDelete.order);
      } else {
        await supabase.from("chapters").delete().eq("book_version_id", resolvedTargetVersionId);
      }
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

    const totalChars = chapterList.reduce(
      (sum, ch) => sum + ((ch.content as string | null) ?? "").length,
      0
    );
    const estimatedCostUnits = Math.ceil(totalChars / 4);
    const budgetUserId = payload.authorId ?? book.author_id;
    if (!budgetUserId) {
      throw new UnrecoverableError("Missing authorId for translation budget enforcement");
    }
    try {
      validateJobCost({
        userId: budgetUserId,
        pipeline: "translation",
        jobSize: totalChars,
        jobId: workerJobId ?? null,
      });
      await checkBudget({
        userId: budgetUserId,
        pipeline: "translation",
        units: estimatedCostUnits,
        jobId: workerJobId ?? null,
      });
    } catch (err) {
      if (err instanceof BudgetExceededError || err instanceof JobCostExceededError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }

    structuredLog("translation_job_started", {
      bookId,
      sourceVersionId,
      targetLanguage: normalizedTarget,
      chapterCount: chapterList.length,
      totalChars,
      scope: selectedChapterId ? "chapter" : "book",
    });

    for (let i = 0; i < chapterList.length; i++) {
      const ch = chapterList[i];
      const sourceContent = (ch.content as string | null) ?? "";
      let translatedContent = sourceContent;

      structuredLog("chapter_translation_started", {
        chapterId: ch.id,
        chapterOrder: ch.order,
        chapterIndex: i,
        totalChapters: chapterList.length,
        sourceChars: sourceContent.length,
      });

      if (sourceContent.trim()) {
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
            // Cost optimization: skip if content is already in target language
            const sampleText = isTiptapJson(sourceContent)
              ? extractText(JSON.parse(sourceContent)).slice(0, 4000)
              : sourceContent.slice(0, 4000);
            const langCheck = detectLanguageWithConfidence(sampleText);

            if (langCheck.language === normalizedTarget && langCheck.confidence > 0.95) {
              structuredLog("chapter_skipped_already_translated", {
                chapterId: ch.id,
                detectedLanguage: langCheck.language,
                confidence: Math.round(langCheck.confidence * 100) / 100,
              });
            } else {
              // Batch translate with retry
              if (isTiptapJson(sourceContent)) {
                const parsed = JSON.parse(sourceContent);
                const texts = collectTiptapTexts(parsed);
                const nonEmptyMap: Array<{ index: number; text: string }> = [];
                for (let ti = 0; ti < texts.length; ti++) {
                  if (texts[ti].trim()) nonEmptyMap.push({ index: ti, text: texts[ti] });
                }

                if (nonEmptyMap.length > 0) {
                  const batches = batchByChars(nonEmptyMap.map((m) => m.text), MAX_BATCH_CHARS);
                  const allTranslated: string[] = [];
                  for (let bi = 0; bi < batches.length; bi++) {
                    const result = await translateBatchWithRetry(
                      batches[bi], sourceLang, normalizedTarget, ch.id, bi,
                    );
                    allTranslated.push(...result);
                  }

                  const fullTexts = [...texts];
                  for (let ti = 0; ti < nonEmptyMap.length; ti++) {
                    fullTexts[nonEmptyMap[ti].index] = allTranslated[ti] ?? texts[nonEmptyMap[ti].index];
                  }
                  translatedContent = JSON.stringify(replaceTiptapTexts(parsed, fullTexts, { i: 0 }));
                }
              } else {
                // Plain text — batch translate paragraphs
                const paragraphs = sourceContent.split(/\n{2,}/).filter((p) => p.trim());
                if (paragraphs.length > 0) {
                  const batches = batchByChars(paragraphs, MAX_BATCH_CHARS);
                  const allTranslated: string[] = [];
                  for (let bi = 0; bi < batches.length; bi++) {
                    const result = await translateBatchWithRetry(
                      batches[bi], sourceLang, normalizedTarget, ch.id, bi,
                    );
                    allTranslated.push(...result);
                  }
                  translatedContent = allTranslated.join("\n\n");
                }
              }
            }
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

      const hash = contentHash(translatedContent);
      const { error: upsertError } = await supabase.from("chapters").upsert(
        {
          book_id: bookId,
          book_version_id: resolvedTargetVersionId,
          title: ch.title ?? `Chapter ${Number(ch.order ?? i) + 1}`,
          content: translatedContent,
          source_text: sourceContent,
          content_hash: hash,
          order: Number(ch.order ?? i),
        },
        { onConflict: "book_version_id,order" }
      );
      if (upsertError) {
        structuredLog("chapter_upsert_failed", {
          chapterId: ch.id,
          error: upsertError.message,
          details: upsertError.details,
        });
        throw new Error(`Failed to upsert translated chapter: ${upsertError.message}`);
      }

      if (!selectedChapterId) {
        translationProgress = Math.round(((i + 1) / chapterList.length) * 100);
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

    await supabase
      .from("book_versions")
      .update({ status: "done", error_message: null })
      .eq("id", resolvedTargetVersionId);

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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[translation worker] failed — bookId:", bookId, "error:", msg);
    if (resolvedTargetVersionId) {
      const safeMessage = msg.slice(0, 500);
      await supabase
        .from("book_versions")
        .update({ status: "failed", error_message: safeMessage })
        .eq("id", resolvedTargetVersionId);
    }
    if (!selectedChapterId) {
      const normalizedTarget = normalizeLanguageOrNull(targetLanguage);
      if (normalizedTarget) {
        await upsertBookTranslationState(supabase, {
          bookId,
          language: normalizedTarget,
          status: "failed",
          progress: translationProgress,
        });
      }
    }
    throw err;
  }
}

function main() {
  assertWorkerEnv();
  assertOpusEnv();

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
        const workerJobId = job.id != null ? String(job.id) : undefined;
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

main();
