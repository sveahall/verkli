/**
 * BullMQ worker: process "translate" jobs for book translations (Opus MT / CTranslate2).
 * Run from apps/web: npm run translate-worker (requires REDIS_URL, Supabase env; Python venv and model in apps/web/models/sv_en)
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { TranslationJobData } from "../src/lib/translation-queue";
import { translateText, sanitizeOpusOutput } from "../src/lib/opus";
import { contentHash } from "../src/lib/import-extract";
import { normalizeLanguage } from "../src/lib/languages";

const QUEUE_NAME = "book-translation";

async function processJob(payload: TranslationJobData) {
  const { originalBookId, targetLanguage } = payload;
  const supabase = createAdminClient();
  let translatedBookId: string | null = null;

  console.log("[translation worker] job received — originalBookId:", originalBookId, "targetLanguage:", targetLanguage);

  try {
    const { data: originalBook, error: bookFetchError } = await supabase
      .from("books")
      .select("id, title, slug, author_id, language")
      .eq("id", originalBookId)
      .single();

    if (bookFetchError || !originalBook) {
      throw new Error(bookFetchError?.message ?? "Original book not found");
    }

    const authorId = originalBook.author_id as string;
    const originalLang = normalizeLanguage(originalBook.language ?? null);
    const title = originalBook.title ?? "Imported";
    const slugBase = (originalBook.slug as string) ?? "book";
    const shortSuffix = () => Math.random().toString(36).slice(2, 8);
    let translatedSlug = `${slugBase}-${targetLanguage}-${shortSuffix()}`;
    const MAX_SLUG_ATTEMPTS = 3;
    let translatedBook: { id: string } | null = null;
    let lastInsertError: { message: string } | null = null;

    console.log("[translation worker] creating translated book...");
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const { data: bookData, error: insertError } = await supabase
        .from("books")
        .insert({
          title: `${title} (${targetLanguage})`,
          slug: translatedSlug,
          author_id: authorId,
          status: "DRAFT",
          language: targetLanguage,
          is_translation: true,
          original_book_id: originalBookId,
          translation_status: "draft",
        })
        .select("id")
        .single();

      if (!insertError && bookData?.id) {
        translatedBook = bookData;
        break;
      }
      const isSlugConflict = insertError?.message?.includes("books_slug_key") ?? false;
      if (isSlugConflict && attempt < MAX_SLUG_ATTEMPTS) {
        translatedSlug = `${slugBase}-${targetLanguage}-${shortSuffix()}`;
        console.warn("[translation worker] slug conflict, retry", attempt, "new slug:", translatedSlug);
        continue;
      }
      lastInsertError = insertError;
      break;
    }

    if (lastInsertError || !translatedBook?.id) {
      throw new Error(lastInsertError?.message ?? "Failed to create translated book");
    }

    translatedBookId = translatedBook.id;
    console.log("[translation worker] translated book created — id:", translatedBookId);

    const { error: translationRowError } = await supabase.from("translations").insert({
      original_book_id: originalBookId,
      translated_book_id: translatedBookId,
      target_language: targetLanguage,
      status: "in_progress",
    });

    if (translationRowError) {
      throw new Error(`Failed to insert translations row: ${translationRowError.message}`);
    }

    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("id, title, source_text, content, order")
      .eq("book_id", originalBookId)
      .order("order", { ascending: true });

    if (chaptersError) {
      await supabase.from("translations").update({ status: "failed" }).eq("translated_book_id", translatedBookId);
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
          translatedText = translateText({
            text: sourceText,
            sourceLanguage: originalLang,
            targetLanguage,
          });
          // Sanitize: drop log lines, fix tokenization underscores, normalize whitespace before saving to chapter
          const sanitized = sanitizeOpusOutput(translatedText);
          if (sanitized !== translatedText) {
            console.log("[translation worker] sanitized opus output");
          }
          translatedText = sanitized;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[translation worker] Opus MT failed for chapter:", ch.id, msg);
          await supabase.from("translations").update({ status: "failed" }).eq("translated_book_id", translatedBookId);
          throw err;
        }
      }
      const hash = contentHash(translatedText);
      await supabase.from("chapters").insert({
        book_id: translatedBookId,
        title: ch.title ?? `Chapter ${i + 1}`,
        content: translatedText,
        source_text: translatedText,
        content_hash: hash,
        order: i,
      });
    }

    await supabase.from("translations").update({ status: "completed" }).eq("translated_book_id", translatedBookId);
    await supabase.from("books").update({ translation_status: "needs_review" }).eq("id", translatedBookId);

    console.log("[translation worker] completed — originalBookId:", originalBookId, "translatedBookId:", translatedBookId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[translation worker] failed — originalBookId:", originalBookId, "error:", msg);
    if (translatedBookId) {
      await supabase.from("translations").update({ status: "failed" }).eq("translated_book_id", translatedBookId);
    }
    throw err;
  }
}

function main() {
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
