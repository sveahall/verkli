/**
 * BullMQ worker: process "extract" jobs for book imports.
 * Run from apps/web: npm run import-worker (requires REDIS_URL and Supabase env in .env.local)
 */

import "./load-dotenv";
import "./sentry-worker-init";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker, UnrecoverableError } from "bullmq";
import { resolveLocalImportPath } from "../src/lib/import-storage";
import {
  runExtract,
  contentHash,
  normalizeChapterTitlesToNumericSequence,
} from "../src/lib/import-extract";
import { plainTextToTiptapDoc } from "../src/lib/tiptap-content";
import { createAdminClient } from "../src/lib/supabase/admin";
import { enqueueTranslationJob } from "../src/lib/translation-queue";
import { detectLanguageFromText } from "../src/lib/language-detect";
import { normalizeLanguageOrNull } from "../src/lib/languages";
import { sanitizeJobErrorForStorage } from "../src/lib/sanitize-job-error";
import { isDuplicate } from "../src/lib/workers/idempotency";
import type { ImportMode } from "../src/lib/import-queue";

import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";

const QUEUE_NAME = QUEUE_NAMES.IMPORT;
const BUCKET = "book-imports";

export type ProcessJobPayload = {
  importId: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  authorId: string;
  bookId?: string;
  mode?: ImportMode;
  targetVersionId?: string | null;
  // Backward compatibility for older queued payloads.
  overwrite?: boolean;
};

type ImportRow = {
  id: string;
  status: string;
  author_id: string;
  book_id: string | null;
  book_version_id: string | null;
  mode: string | null;
};

type BillingRow = {
  plan: string | null;
  status: string | null;
};

function isActiveBillingStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "active" || normalized === "trialing";
}

async function isAuthorProActive(
  supabase: ReturnType<typeof createAdminClient>,
  authorId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("billing_accounts")
    .select("plan, status")
    .eq("user_id", authorId)
    .maybeSingle();

  if (error) {
    console.warn("[import worker] failed to check billing for translation auto-enqueue", {
      authorId,
      code: error.code,
      message: error.message,
    });
    return false;
  }

  const row = (data ?? null) as BillingRow | null;
  if (!row) return false;
  return String(row.plan ?? "").trim().toLowerCase() === "pro" && isActiveBillingStatus(row.status);
}

function normalizeImportMode(value: unknown, legacyOverwrite?: boolean): ImportMode {
  if (value === "overwrite_draft") return "overwrite_draft";
  if (value === "new_version") return "new_version";
  if (legacyOverwrite === true) return "overwrite_draft";
  return "new_version";
}

function isUniqueLanguageConstraint(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("book_versions_book_id_language_code_key") ||
    (msg.includes("duplicate") && msg.includes("language_code"))
  );
}

function normalizeTitleValue(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePlaceholderBookTitle(value: string | null | undefined): boolean {
  const normalized = normalizeTitleValue(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "untitled" ||
    normalized === "namnlös" ||
    normalized === "namnlos" ||
    normalized === "book" ||
    normalized === "bok" ||
    normalized === "title" ||
    normalized === "titel" ||
    normalized === "imported"
  );
}

function isFrontMatterChapterTitle(value: string | null | undefined): boolean {
  const normalized = normalizeTitleValue(value).toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "förord" ||
    normalized === "forord" ||
    normalized === "inledning" ||
    normalized === "prolog" ||
    normalized === "epilog" ||
    normalized === "efterord" ||
    normalized === "innehåll" ||
    normalized === "innehållsförteckning" ||
    normalized === "innehallsforteckning" ||
    normalized === "contents" ||
    normalized === "table of contents" ||
    normalized === "front matter" ||
    normalized === "introduction"
  );
}

async function ensureLocalFile(
  filePath: string,
  fileStorage: "local" | "supabase",
  userId: string
): Promise<string> {
  if (fileStorage === "local") {
    const localPath = resolveLocalImportPath(filePath);
    console.log("[import worker] Reading local file:", localPath);
    const exists = await fs.access(localPath).then(() => true).catch(() => false);
    if (!exists) {
      throw new Error(
        `Local file not found: ${localPath}. Ensure the app wrote to this path (check LOCAL_IMPORTS_DIR).`
      );
    }
    return localPath;
  }

  console.log("[import worker] Downloading from Supabase Storage:", filePath);
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error || !data) {
    throw new Error(`Supabase download failed: ${error?.message ?? "no data"}. Check bucket "${BUCKET}" and path.`);
  }

  const tmpDir = path.join(os.tmpdir(), "verkli-import", userId);
  await fs.mkdir(tmpDir, { recursive: true });
  const ext = path.extname(filePath) || "";
  const localPath = path.join(tmpDir, path.basename(filePath) || `import${ext}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
  console.log("[import worker] Downloaded to temp:", localPath);
  return localPath;
}

async function createNewScopedVersion(args: {
  supabase: ReturnType<typeof createAdminClient>;
  bookId: string;
  preferredLanguage: string;
  importId: string;
  warnings: string[];
}): Promise<{ id: string; languageCode: string }> {
  const { supabase, bookId, preferredLanguage, importId, warnings } = args;
  const shortImport = importId.replace(/-/g, "").slice(0, 6);
  const baseLanguage = preferredLanguage || "und";

  const candidates: string[] = [baseLanguage];
  for (let i = 1; i <= 5; i++) {
    candidates.push(`${baseLanguage}-import-${shortImport}-${i}`);
  }

  for (let i = 0; i < candidates.length; i++) {
    const languageCode = candidates[i];
    const { data: version, error } = await supabase
      .from("book_versions")
      .insert({
        book_id: bookId,
        language_code: languageCode,
        status: "draft",
      })
      .select("id")
      .single();

    if (!error && version?.id) {
      if (i > 0) {
        warnings.push("language_conflict_adjusted");
      }
      return { id: version.id, languageCode };
    }

    if (!error || !isUniqueLanguageConstraint(error.message) || i === candidates.length - 1) {
      throw new Error(error?.message ?? "Failed to create new book version");
    }
  }

  throw new Error("Failed to create new book version");
}

/** Process a single import job. Exported for use by apps/worker. */
export async function processJob(payload: ProcessJobPayload) {
  const { importId, filePath, fileStorage, authorId } = payload;
  const supabase = createAdminClient();

  const updateImport = async (updates: Record<string, unknown>) => {
    const { error } = await supabase
      .from("book_imports")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", importId);

    if (error) {
      console.error("[import worker] failed to update import row", {
        importId,
        message: error.message,
        updates,
      });
    }
  };

  try {
    console.log("[import worker] job received", {
      importId,
      fileStorage,
      payloadBookId: payload.bookId ?? null,
      payloadMode: payload.mode ?? null,
    });

    const { data: importRowData, error: importLoadError } = await supabase
      .from("book_imports")
      .select("id, status, author_id, book_id, book_version_id, mode")
      .eq("id", importId)
      .single();

    if (importLoadError || !importRowData) {
      throw new Error(importLoadError?.message ?? "Import record not found");
    }

    const importRow = importRowData as ImportRow;

    // Processor-level dedupe: skip if import already completed with chapters.
    const versionId = importRow.book_version_id;
    const alreadyDone = await isDuplicate(async () => {
      if (!versionId || importRow.status !== "completed") return false;
      const { count } = await supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("book_version_id", versionId);
      return (count ?? 0) > 0;
    }, `import:${importId}`);

    if (alreadyDone) {
      await updateImport({ status: "completed", progress: 100 });
      return;
    }

    if (importRow.author_id !== authorId) {
      await updateImport({
        status: "failed",
        progress: 0,
        error_message: "Ownership mismatch: authorId does not match import owner",
      });
      throw new UnrecoverableError("Ownership mismatch: authorId does not match import owner");
    }

    const mode = normalizeImportMode(importRow.mode ?? payload.mode, payload.overwrite);
    const scopedBookId = importRow.book_id ?? payload.bookId ?? null;

    await updateImport({ status: "extracting", progress: 10, mode, error_message: null });

    const localPath = await ensureLocalFile(filePath, fileStorage, authorId);
    await updateImport({ status: "extracting", progress: 30 });

    const extracted = await runExtract(localPath);
    const title = extracted.title || "Imported";
    const chapters = extracted.chapters;

    if (!chapters.length) {
      throw new Error("Import extraction returned no chapters");
    }

    const normalizedChapterTitles = normalizeChapterTitlesToNumericSequence(
      chapters.map((chapter, index) => chapter.title?.trim() || `Kapitel ${index + 1}`)
    );
    const normalizedChapters = chapters.map((chapter, index) => ({
      ...chapter,
      title: normalizedChapterTitles[index] || `Kapitel ${index + 1}`,
    }));

    await updateImport({ status: "extracting", progress: 55 });

    const warnings: string[] = [];
    const sampleText = normalizedChapters.find((ch) => ch.sourceText?.trim())?.sourceText ?? "";
    const detectedLanguage = detectLanguageFromText(sampleText);
    const normalizedDetected = normalizeLanguageOrNull(detectedLanguage);
    if (!normalizedDetected) {
      warnings.push("language_detection_fallback");
    }

    let targetBookId: string;
    let targetBookVersionId: string;
    let targetLanguageCode: string;
    let existingBookTitle: string | null = null;
    let titleSet = false;
    let resolvedBookTitle: string | null = null;

    if (scopedBookId) {
      const { data: bookRow, error: bookError } = await supabase
        .from("books")
        .select("id, title, author_id, original_language, language")
        .eq("id", scopedBookId)
        .single();

      if (bookError || !bookRow) {
        throw new Error(bookError?.message ?? "Scoped book not found");
      }

      if (bookRow.author_id !== authorId) {
        throw new Error("Ownership mismatch: scoped book does not belong to author");
      }

      targetBookId = bookRow.id;
      existingBookTitle = normalizeTitleValue(bookRow.title);

      if (mode === "overwrite_draft") {
        const requestedVersionId =
          payload.targetVersionId ?? importRow.book_version_id ?? null;

        let targetVersion:
          | {
              id: string;
              book_id: string;
              language_code: string;
              published_at: string | null;
            }
          | null = null;

        if (requestedVersionId) {
          const { data: versionRow, error: versionError } = await supabase
            .from("book_versions")
            .select("id, book_id, language_code, published_at")
            .eq("id", requestedVersionId)
            .single();

          if (versionError || !versionRow) {
            throw new Error(versionError?.message ?? "Draft version not found");
          }

          targetVersion = versionRow;
        } else {
          const { data: latestDraft, error: latestDraftError } = await supabase
            .from("book_versions")
            .select("id, book_id, language_code, published_at")
            .eq("book_id", targetBookId)
            .is("published_at", null)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestDraftError) {
            throw new Error(latestDraftError.message);
          }

          targetVersion = latestDraft;
        }

        if (!targetVersion || targetVersion.book_id !== targetBookId) {
          throw new Error("No draft version available for overwrite");
        }

        if (targetVersion.published_at) {
          throw new Error("Cannot overwrite a published version");
        }

        const { error: deleteError } = await supabase
          .from("chapters")
          .delete()
          .eq("book_version_id", targetVersion.id);

        if (deleteError) {
          throw new Error(`Failed to clear draft chapters: ${deleteError.message}`);
        }

        targetBookVersionId = targetVersion.id;
        targetLanguageCode = targetVersion.language_code;
      } else {
        const preferredLanguage =
          normalizedDetected ??
          normalizeLanguageOrNull(bookRow.original_language) ??
          normalizeLanguageOrNull(bookRow.language) ??
          "und";

        const newVersion = await createNewScopedVersion({
          supabase,
          bookId: targetBookId,
          preferredLanguage,
          importId,
          warnings,
        });

        targetBookVersionId = newVersion.id;
        targetLanguageCode = newVersion.languageCode;
      }
    } else {
      // Legacy flow without a target book: create a new book + initial draft version.
      const baseSlug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "untitled";
      const shortFromId = importId.replace(/-/g, "").slice(0, 6);

      let slug = `${baseSlug}-${shortFromId}`;
      let createdBookId: string | null = null;
      const resolvedLanguage = normalizedDetected ?? "und";

      for (let attempt = 1; attempt <= 3; attempt++) {
        const { data: createdBook, error } = await supabase
          .from("books")
          .insert({
            title,
            slug,
            author_id: authorId,
            status: "DRAFT",
            language: resolvedLanguage,
            original_language: resolvedLanguage,
          })
          .select("id")
          .single();

        if (!error && createdBook?.id) {
          createdBookId = createdBook.id;
          break;
        }

        const isSlugConflict = error?.message?.includes("books_slug_key") ?? false;
        if (isSlugConflict && attempt < 3) {
          slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
          continue;
        }

        throw new Error(error?.message ?? "Failed to create imported book");
      }

      if (!createdBookId) {
        throw new Error("Failed to create imported book");
      }

      const { data: version, error: versionError } = await supabase
        .from("book_versions")
        .insert({
          book_id: createdBookId,
          language_code: resolvedLanguage,
          status: "draft",
        })
        .select("id")
        .single();

      if (versionError || !version?.id) {
        throw new Error(versionError?.message ?? "Failed to create imported book version");
      }

      targetBookId = createdBookId;
      targetBookVersionId = version.id;
      targetLanguageCode = resolvedLanguage;
      resolvedBookTitle = title;
    }

    if (scopedBookId) {
      const extractedTitle = normalizeTitleValue(title);
      if (extractedTitle && !looksLikePlaceholderBookTitle(extractedTitle)) {
        resolvedBookTitle = extractedTitle;

        if (looksLikePlaceholderBookTitle(existingBookTitle)) {
          const { error: titleUpdateError } = await supabase
            .from("books")
            .update({ title: extractedTitle })
            .eq("id", targetBookId)
            .eq("author_id", authorId);

          if (titleUpdateError) {
            warnings.push("title_set_failed");
          } else {
            titleSet = true;
            existingBookTitle = extractedTitle;
          }
        }
      } else {
        resolvedBookTitle = existingBookTitle;
      }
    }

    await updateImport({ status: "extracting", progress: 70, book_id: targetBookId, book_version_id: targetBookVersionId, mode });

    // ─── Dedup: fetch existing content hashes so we skip identical chapters ───
    const { data: existingChapters } = await supabase
      .from("chapters")
      .select("content_hash, order")
      .eq("book_version_id", targetBookVersionId)
      .not("content_hash", "is", null);

    const existingHashes = new Set(
      (existingChapters ?? []).map((c: { content_hash: string }) => c.content_hash)
    );

    // Build rows, skipping duplicates
    const rows: Record<string, unknown>[] = [];
    let dedupSkipped = 0;

    for (let i = 0; i < normalizedChapters.length; i++) {
      const ch = normalizedChapters[i];
      const chapterTitle = (ch.title ?? "").trim() || `Kapitel ${i + 1}`;
      if (!ch.title?.trim()) {
        warnings.push(`title_fallback_${i + 1}`);
      }

      const sourceText = ch.sourceText ?? "";
      const hash = contentHash(sourceText);

      if (existingHashes.has(hash)) {
        dedupSkipped++;
        continue;
      }

      rows.push({
        book_id: targetBookId,
        book_version_id: targetBookVersionId,
        title: chapterTitle,
        content: JSON.stringify(plainTextToTiptapDoc(sourceText)),
        source_text: sourceText,
        content_hash: hash,
        order: i,
      });
    }

    if (dedupSkipped > 0) {
      warnings.push(`dedupe_skipped_${dedupSkipped}`);
      console.log("[import worker] dedup skipped chapters", {
        importId,
        dedupSkipped,
        totalChapters: normalizedChapters.length,
        inserting: rows.length,
      });
    }

    const frontMatterCount = normalizedChapters.filter((chapter) =>
      isFrontMatterChapterTitle(chapter.title)
    ).length;

    // ─── Batch insert with rollback on failure ───
    const BATCH_SIZE = 50;
    let insertedCount = 0;

    try {
      for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
        const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
        const { error: batchError } = await supabase
          .from("chapters")
          .upsert(batch, { onConflict: "book_version_id,order" });

        if (batchError) {
          throw new Error(
            `Batch insert failed at offset ${batchStart}: ${batchError.message}`
          );
        }

        insertedCount += batch.length;
        const progress = 70 + Math.floor((insertedCount / rows.length) * 29);
        await updateImport({ status: "extracting", progress });
      }
    } catch (insertError) {
      // Rollback: remove all chapters we inserted for this version to avoid orphans
      console.error("[import worker] batch insert failed, rolling back chapters", {
        importId,
        targetBookVersionId,
        insertedCount,
        totalRows: rows.length,
      });

      await supabase
        .from("chapters")
        .delete()
        .eq("book_version_id", targetBookVersionId);

      throw insertError;
    }

    await updateImport({
      book_id: targetBookId,
      book_version_id: targetBookVersionId,
      mode,
      status: "completed",
      progress: 100,
      error_message: null,
      result: {
        chapterCount: normalizedChapters.length,
        chaptersCreated: rows.length,
        insertedCount: rows.length,
        dedupSkipped,
        frontMatterCount,
        titleSet,
        bookTitle: resolvedBookTitle,
        warnings,
        mode,
        languageCode: targetLanguageCode,
        detectedLanguage: detectedLanguage ?? null,
      },
    });

    console.log("[import worker] completed", {
      importId,
      bookId: targetBookId,
      bookVersionId: targetBookVersionId,
      mode,
      chapterCount: normalizedChapters.length,
      warnings: warnings.length,
    });

    if (process.env.TRANSLATIONS_AUTO_ENQUEUE === "true") {
      const originalLang = normalizeLanguageOrNull(targetLanguageCode);
      if (originalLang && originalLang !== "en") {
        const proActive = await isAuthorProActive(supabase, authorId);
        if (!proActive) {
          console.log("[import worker] translation auto-enqueue skipped (pro required)", {
            importId,
            authorId,
            bookId: targetBookId,
          });
        } else {
          const translationJobId = await enqueueTranslationJob({
            bookId: targetBookId,
            sourceVersionId: targetBookVersionId,
            targetLanguage: "en",
          });
          if (translationJobId) {
            console.log("[import worker] translation job enqueued", {
              importId,
              bookId: targetBookId,
              targetLanguage: "en",
              jobId: translationJobId,
            });
          }
        }
      }
    }

    if (fileStorage === "supabase") {
      try {
        const tmpDir = path.join(os.tmpdir(), "verkli-import", authorId);
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safe = sanitizeJobErrorForStorage(raw);

    console.error("[import worker] failed", {
      importId,
      authorId,
      message: raw,
    });

    const supabase = createAdminClient();
    await supabase
      .from("book_imports")
      .update({
        status: "failed",
        progress: 0,
        error_message: safe,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId);

    throw error;
  }
}

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error(
      "[import worker] REDIS_URL not set. Set REDIS_URL (e.g. redis://localhost:6379) and ensure Redis is running (docker compose up -d)."
    );
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error(
      "[import worker] Redis not reachable. Check REDIS_URL (e.g. redis://localhost:6379) and that Redis is running."
    );
    process.exit(1);
  }

  console.log("[import-worker] started", {
    queue: QUEUE_NAME,
    redis: `${connection.host}:${connection.port}`,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "extract" && job.data) {
        console.log("[import-worker] processing job", job.id);
        await processJob(job.data as ProcessJobPayload);
      }
    },
    {
      connection: {
        host: connection.host,
        port: connection.port,
        password: connection.password,
      },
      concurrency: 3,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log("[import worker] job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    Sentry.captureException(err);
    console.error("[import-worker] job failed", job?.id, err?.message, err?.stack);
  });

  worker.on("error", (err) => {
    console.error("[import worker] Redis/queue error:", err.message, err.stack);
  });

  const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

  worker.on("closed", () => clearInterval(heartbeatInterval));

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[import worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[import worker] shutting down...");
    clearInterval(heartbeatInterval);
    await worker.close();
    process.exit(0);
  });
}

main();
