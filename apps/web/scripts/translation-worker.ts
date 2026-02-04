/**
 * BullMQ worker: process "translate" jobs for book translations (Opus MT / CTranslate2).
 * Run from apps/web: npm run translate-worker (requires REDIS_URL, Supabase env; Python venv and model in apps/web/models/sv_en)
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { TranslationJobData } from "../src/lib/translation-queue";
import { translateText, sanitizeOpusOutput } from "../src/lib/opus";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguageOrNull } from "../src/lib/languages";

const QUEUE_NAME = "book-translation";

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

async function processJob(payload: TranslationJobData) {
  const {
    bookId,
    sourceVersionId,
    targetLanguage,
    targetVersionId,
    overwrite,
  } = payload;
  const supabase = createAdminClient();
  let resolvedTargetVersionId: string | null = null;

  console.log(
    "[translation worker] job received — bookId:",
    bookId,
    "sourceVersionId:",
    sourceVersionId,
    "targetLanguage:",
    targetLanguage
  );

  try {
    const { data: book, error: bookFetchError } = await supabase
      .from("books")
      .select("id, title, slug, author_id, original_language, language")
      .eq("id", bookId)
      .single();

    if (bookFetchError || !book) {
      throw new Error(bookFetchError?.message ?? "Book not found");
    }

    const { data: sourceVersion, error: sourceVersionError } = await supabase
      .from("book_versions")
      .select("id, book_id, language_code")
      .eq("id", sourceVersionId)
      .single();

    if (sourceVersionError || !sourceVersion) {
      throw new Error(sourceVersionError?.message ?? "Source version not found");
    }
    if (sourceVersion.book_id !== bookId) {
      throw new Error("Source version does not belong to book");
    }

    const sourceLang =
      normalizeLanguageOrNull(sourceVersion.language_code) ??
      normalizeLanguageOrNull(book.original_language ?? null) ??
      normalizeLanguageOrNull(book.language ?? null);
    const normalizedTarget = normalizeLanguageOrNull(targetLanguage);

    if (!sourceLang) {
      throw new Error("Source language missing for translation job");
    }
    if (!normalizedTarget) {
      throw new Error("Target language missing or unsupported for translation job");
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
      if (normalizeLanguage(targetVersion.language_code) !== normalizedTarget) {
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
      .update({ status: "translating" })
      .eq("id", resolvedTargetVersionId);

    if (overwrite) {
      await supabase.from("chapters").delete().eq("book_version_id", resolvedTargetVersionId);
    }

    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("id, title, source_text, content, order")
      .eq("book_version_id", sourceVersionId)
      .order("order", { ascending: true });

    if (chaptersError) {
      throw new Error(chaptersError.message);
    }

    const chapterList = chapters ?? [];
    console.log("[translation worker] translating chapters — count:", chapterList.length);

    for (let i = 0; i < chapterList.length; i++) {
      const ch = chapterList[i];
      const sourceText = (ch.source_text as string | null) ?? (ch.content as string | null) ?? "";
      let translatedText = sourceText;
      if (sourceText.trim()) {
        try {
          // Opus MT must translate paragraph-by-paragraph to preserve book formatting.
          // Splitting on double newlines keeps chapter structure; each paragraph is translated
          // separately and re-joined, so output matches original layout.
          const paragraphs = sourceText.split(/\n{2,}/);
          const translatedParagraphs: string[] = [];
          for (const p of paragraphs) {
            if (!p.trim()) continue;
            const raw = translateText({
              text: p,
              sourceLanguage: sourceLang,
              targetLanguage: normalizedTarget,
            });
            console.log("RAW FROM OPUS:", raw.slice(0, 200));
            const sanitized = sanitizeOpusOutput(raw);
            console.log("SANITIZED:", sanitized.slice(0, 200));
            if (!sanitized.trim()) {
              throw new Error("Opus MT returned empty paragraph after sanitization");
            }
            translatedParagraphs.push(sanitized);
          }
          translatedText = translatedParagraphs.join("\n\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[translation worker] Opus MT failed for chapter:", ch.id, msg);
          await supabase.from("book_versions").update({ status: "failed" }).eq("id", resolvedTargetVersionId);
          throw err;
        }
      }
      const hash = contentHash(translatedText);
      await supabase.from("chapters").insert({
        book_id: bookId,
        book_version_id: resolvedTargetVersionId,
        title: ch.title ?? `Chapter ${i + 1}`,
        content: translatedText,
        source_text: translatedText,
        content_hash: hash,
        order: i,
      });
    }

    await supabase.from("book_versions").update({ status: "done" }).eq("id", resolvedTargetVersionId);

    console.log("[translation worker] completed — bookId:", bookId, "targetVersionId:", resolvedTargetVersionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[translation worker] failed — bookId:", bookId, "error:", msg);
    if (resolvedTargetVersionId) {
      await supabase.from("book_versions").update({ status: "failed" }).eq("id", resolvedTargetVersionId);
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

  console.log("[translation worker] worker started — queue:", QUEUE_NAME, "redis:", connection.host + ":" + connection.port);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "translate" && job.data) {
        await processJob(job.data as TranslationJobData);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[translation worker] job completed:", job.id);
  });
  worker.on("failed", (job, err) => {
    console.error("[translation worker] job failed:", job?.id, err?.message);
  });
  worker.on("error", (err) => {
    console.error("[translation worker] Redis/queue error:", err.message);
  });
}

main();
