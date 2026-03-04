/**
 * BullMQ worker: process "translate" jobs for book translations (Opus MT / CTranslate2).
 * Run from apps/web: npm run translate-worker (requires REDIS_URL, Supabase env; Python venv and model in apps/web/models/sv_en)
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker, UnrecoverableError } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { TranslationJobData } from "../src/lib/translation-queue";
import { translateText, sanitizeOpusOutput } from "../src/lib/opus";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguageOrNull } from "../src/lib/languages";
import { isDuplicate } from "../src/lib/workers/idempotency";
import { checkBudget, BudgetExceededError } from "../src/lib/workers/budget";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";

const QUEUE_NAME = QUEUE_NAMES.TRANSLATION;
const PIPELINE_SMOKE_MODE = process.env.PIPELINE_SMOKE_MODE === "true";

function translateSmokeText(text: string, targetLanguage: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const normalizedTarget = targetLanguage.trim().toLowerCase();
  return `[smoke:${normalizedTarget}] ${trimmed}`;
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
 * Recursively translate all text nodes within a TipTap JSON structure.
 * Preserves formatting (bold, italic, headings, etc.) by only modifying text content.
 */
function translateTiptapNode(
  node: unknown,
  translateFn: (text: string) => string
): unknown {
  if (!node || typeof node !== "object") return node;
  
  const n = node as Record<string, unknown>;
  
  // If it's a text node, translate its content
  if (n.type === "text" && typeof n.text === "string") {
    const translated = translateFn(n.text);
    return { ...n, text: translated };
  }
  
  // If it has content array, recursively process children
  if (Array.isArray(n.content)) {
    return {
      ...n,
      content: n.content.map((child) => translateTiptapNode(child, translateFn)),
    };
  }
  
  return node;
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
      await checkBudget({
        userId: budgetUserId,
        pipeline: "translation",
        units: estimatedCostUnits,
        jobId: workerJobId ?? null,
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }

    console.log("[translation worker] translating chapters — count:", chapterList.length);

    for (let i = 0; i < chapterList.length; i++) {
      const ch = chapterList[i];
      const sourceContent = (ch.content as string | null) ?? "";
      let translatedContent = sourceContent;
      
      if (sourceContent.trim()) {
        try {
          // Helper function to translate a single text string via Opus MT
          const doTranslate = (text: string): string => {
            if (!text.trim()) return text;
            if (PIPELINE_SMOKE_MODE) {
              return translateSmokeText(text, normalizedTarget);
            }
            const raw = translateText({
              text,
              sourceLanguage: sourceLang,
              targetLanguage: normalizedTarget,
            });
            const sanitized = sanitizeOpusOutput(raw);
            if (!sanitized.trim()) {
              throw new Error("Opus MT returned empty text after sanitization");
            }
            return sanitized;
          };

          if (isTiptapJson(sourceContent)) {
            // Content is TipTap JSON - translate text nodes while preserving structure
            console.log("[translation worker] detected TipTap JSON, translating text nodes...");
            const parsed = JSON.parse(sourceContent);
            const translated = translateTiptapNode(parsed, doTranslate);
            translatedContent = JSON.stringify(translated);
            console.log("[translation worker] translated TipTap content preview:", extractText(translated).slice(0, 100));
          } else {
            // Plain text content - translate paragraph by paragraph
            console.log("[translation worker] plain text content, translating paragraphs...");
            const paragraphs = sourceContent.split(/\n{2,}/);
            const translatedParagraphs: string[] = [];
            for (const p of paragraphs) {
              if (!p.trim()) continue;
              translatedParagraphs.push(doTranslate(p));
            }
            translatedContent = translatedParagraphs.join("\n\n");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[translation worker] Opus MT failed for chapter:", ch.id, msg);
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
        console.error("[translation worker] chapter upsert failed:", upsertError.message, upsertError.details, upsertError.hint);
        throw new Error(`Failed to upsert translated chapter: ${upsertError.message}`);
      }
      console.log("[translation worker] chapter upserted — order:", ch.order, "title:", ch.title);
    }

    await supabase
      .from("book_versions")
      .update({ status: "done", error_message: null })
      .eq("id", resolvedTargetVersionId);

    console.log("[translation worker] completed — bookId:", bookId, "targetVersionId:", resolvedTargetVersionId);
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
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
      concurrency: 2,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[translation worker] job completed:", job.id);
  });
  worker.on("failed", (job, err) => {
    console.error("[translation-worker] job failed", job?.id, err?.message);
  });
  worker.on("error", (err) => {
    console.error("[translation worker] Redis/queue error:", err.message);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

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
