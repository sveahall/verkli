/**
 * BullMQ worker: process "extract" jobs for book imports.
 * Run from apps/web: npm run import-worker (requires REDIS_URL and Supabase env in .env.local)
 */

import "./load-dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { resolveLocalImportPath } from "../src/lib/import-storage";
import { runExtract, contentHash } from "../src/lib/import-extract";
import { createAdminClient } from "../src/lib/supabase/admin";
import { enqueueTranslationJob } from "../src/lib/translation-queue";
import { normalizeLanguage } from "../src/lib/languages";

const QUEUE_NAME = "book-import-extract";
const BUCKET = "book-imports";

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
      throw new Error(`Local file not found: ${localPath}. Ensure the app wrote to this path (check LOCAL_IMPORTS_DIR).`);
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

async function processJob(payload: {
  importId: string;
  filePath: string;
  fileStorage: "local" | "supabase";
  authorId: string;
}) {
  const { importId, filePath, fileStorage, authorId } = payload;
  const supabase = createAdminClient();

  const updateProgress = async (status: string, progress: number, error_message?: string | null) => {
    await supabase
      .from("book_imports")
      .update({ status, progress, error_message: error_message ?? null, updated_at: new Date().toISOString() })
      .eq("id", importId);
  };

  try {
    console.log("[import worker] job received — importId:", importId, "storage:", fileStorage);
    await updateProgress("extracting", 10);

    console.log("[import worker] extracting file...");
    const localPath = await ensureLocalFile(filePath, fileStorage, authorId);
    await updateProgress("extracting", 30);

    const { title, chapters } = await runExtract(localPath);
    console.log("[import worker] extracted title:", title || "(untitled)", "chapters:", chapters.length);
    await updateProgress("extracting", 70);

    const baseSlug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "untitled";
    const shortFromId = importId.replace(/-/g, "").slice(0, 6);
    let slug = `${baseSlug}-${shortFromId}`;
    const MAX_SLUG_ATTEMPTS = 3;
    let book: { id: string } | null = null;
    let bookVersion: { id: string } | null = null;
    let lastBookError: { message: string } | null = null;

    console.log("[import worker] creating book...");
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const { data: bookData, error: insertError } = await supabase
        .from("books")
        .insert({
          title: title || "Imported",
          slug,
          author_id: authorId,
          status: "DRAFT",
          language: "sv",
          original_language: "sv",
        })
        .select("id")
        .single();

      if (!insertError && bookData?.id) {
        book = bookData;
        break;
      }
      const isSlugConflict = insertError?.message?.includes("books_slug_key") ?? false;
      if (isSlugConflict && attempt < MAX_SLUG_ATTEMPTS) {
        const suffix = Math.random().toString(36).slice(2, 8);
        slug = `${baseSlug}-${suffix}`;
        console.warn("[import worker] slug conflict, retry", attempt, "new slug:", slug);
        continue;
      }
      lastBookError = insertError;
      break;
    }

    if (lastBookError || !book?.id) {
      const errMsg = lastBookError?.message ?? "Failed to create book";
      console.error("[import worker] failed creating book:", errMsg);
      await updateProgress("failed", 0, errMsg);
      return;
    }

    const { data: versionData, error: versionError } = await supabase
      .from("book_versions")
      .insert({
        book_id: book.id,
        language_code: "sv",
        status: "draft",
      })
      .select("id")
      .single();

    if (versionError || !versionData?.id) {
      const errMsg = versionError?.message ?? "Failed to create book version";
      console.error("[import worker] failed creating book version:", errMsg);
      await updateProgress("failed", 0, errMsg);
      return;
    }

    bookVersion = versionData;

    console.log("[import worker] creating chapters...", chapters.length);
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const hash = contentHash(ch.sourceText);
      await supabase.from("chapters").insert({
        book_id: book.id,
        book_version_id: bookVersion.id,
        title: ch.title,
        content: ch.sourceText,
        source_text: ch.sourceText,
        content_hash: hash,
        order: i,
      });
      const progress = 70 + Math.floor(((i + 1) / chapters.length) * 30);
      await updateProgress("extracting", progress);
    }

    await supabase
      .from("book_imports")
      .update({
        book_id: book.id,
        book_version_id: bookVersion.id,
        status: "completed",
        progress: 100,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId);

    console.log("[import worker] completed — importId:", importId, "bookId:", book.id);

    if (process.env.TRANSLATIONS_AUTO_ENQUEUE === "true") {
      const { data: bookRow } = await supabase.from("books").select("language").eq("id", book.id).single();
      const originalLang = normalizeLanguage(bookRow?.language ?? null);
      if (originalLang !== "en") {
        const jobId = await enqueueTranslationJob({
          bookId: book.id,
          sourceVersionId: bookVersion.id,
          targetLanguage: "en",
        });
        if (jobId) {
          console.log("[import worker] translation job enqueued — bookId:", book.id, "targetLanguage: en");
        }
      }
    }

    if (fileStorage === "supabase") {
      try {
        const tmpDir = path.join(os.tmpdir(), "verkli-import", authorId);
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[import worker] failed — importId:", importId, "error:", msg);
    await updateProgress("failed", 0, msg);
    throw err;
  }
}

function main() {
  const url = process.env.REDIS_URL ?? "";
  if (!url || url.trim() === "") {
    console.error("[import worker] REDIS_URL not set. Set REDIS_URL (e.g. redis://localhost:6379) and ensure Redis is running (docker compose up -d).");
    process.exit(1);
  }

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error("[import worker] Redis not reachable. Check REDIS_URL (e.g. redis://localhost:6379) and that Redis is running.");
    process.exit(1);
  }

  console.log("[import worker] worker started — queue:", QUEUE_NAME, "redis:", connection.host + ":" + connection.port);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "extract" && job.data) {
        await processJob(job.data as Parameters<typeof processJob>[0]);
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
    console.log("[import worker] job completed:", job.id);
  });
  worker.on("failed", (job, err) => {
    console.error("[import worker] job failed:", job?.id, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[import worker] Redis/queue error:", err.message);
  });
}

main();
