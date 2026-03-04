import { Queue } from "bullmq";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import * as crypto from "node:crypto";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_PREFIX = "[pipeline smoke]";
const IMPORT_QUEUE_NAME = "book-import-extract";
const TRANSLATION_QUEUE_NAME = "book-translation";
const AUDIOBOOK_QUEUE_NAME = "audiobook-generation";
const IMPORT_BUCKET = "book-imports";
const POLL_INTERVAL_MS = 200;

type RedisConnection = {
  host: string;
  port: number;
  password?: string;
};

type ImportState = {
  id: string;
  status: string;
  error_message: string | null;
  book_id: string | null;
  book_version_id: string | null;
};

type BookVersionState = {
  id: string;
  status: string;
  error_message: string | null;
};

type AiJobState = {
  id: string;
  status: string;
  error: string | null;
};

function loadLocalEnvFiles(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const candidates = [
    path.join(repoRoot, "apps", "web", ".env.local"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env"),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    loadDotenv({ path: envPath, override: false });
    console.log(`${FEATURE_PREFIX} loaded env from ${envPath}`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${FEATURE_PREFIX} missing required env: ${name}`);
  }
  return value;
}

function parseRedisConnection(redisUrl: string): RedisConnection {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error(`${FEATURE_PREFIX} invalid REDIS_URL: ${redisUrl}`);
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`${FEATURE_PREFIX} invalid Redis port in REDIS_URL: ${redisUrl}`);
  }

  return {
    host: parsed.hostname,
    port,
    password: parsed.password || undefined,
  };
}

function appendStatus(history: string[], next: string | null | undefined): void {
  if (!next) return;
  if (history[history.length - 1] === next) return;
  history.push(next);
}

function assertStatusSequence(history: string[], expected: string[], label: string): void {
  let expectedIndex = 0;
  for (const current of history) {
    if (current === expected[expectedIndex]) {
      expectedIndex += 1;
      if (expectedIndex === expected.length) return;
    }
  }

  throw new Error(
    `${FEATURE_PREFIX} ${label} status sequence mismatch. expected=${expected.join(" -> ")} observed=${history.join(
      " -> "
    )}`
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBucket(supabase: SupabaseClient, bucketName: string): Promise<void> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`${FEATURE_PREFIX} failed to list buckets: ${listError.message}`);
  }

  const existing = buckets?.find((bucket) => bucket.name === bucketName);
  if (existing) return;

  const { error: createError } = await supabase.storage.createBucket(bucketName, { public: false });
  if (createError) {
    throw new Error(`${FEATURE_PREFIX} failed to create bucket "${bucketName}": ${createError.message}`);
  }

  console.log(`${FEATURE_PREFIX} created bucket ${bucketName}`);
}

async function assertStorageObjectExists(
  supabase: SupabaseClient,
  bucketName: string,
  objectPath: string,
  label: string
): Promise<void> {
  const { data, error } = await supabase.storage.from(bucketName).download(objectPath);
  if (error || !data) {
    throw new Error(
      `${FEATURE_PREFIX} missing storage object for ${label} bucket=${bucketName} path=${objectPath} error=${
        error?.message ?? "no data"
      }`
    );
  }
}

async function waitForImportCompletion(
  supabase: SupabaseClient,
  importId: string,
  timeoutMs: number
): Promise<{ row: ImportState; history: string[] }> {
  const startedAt = Date.now();
  const history: string[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("book_imports")
      .select("id, status, error_message, book_id, book_version_id")
      .eq("id", importId)
      .maybeSingle();

    if (error) {
      throw new Error(`${FEATURE_PREFIX} failed to read book_imports status: ${error.message}`);
    }

    const row = data as ImportState | null;
    if (!row) {
      throw new Error(`${FEATURE_PREFIX} import row not found: ${importId}`);
    }

    appendStatus(history, row.status);

    if (row.status === "failed") {
      throw new Error(`${FEATURE_PREFIX} import failed: ${row.error_message ?? "unknown error"}`);
    }

    if (row.status === "completed" && row.book_id && row.book_version_id) {
      return { row, history };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${FEATURE_PREFIX} timeout waiting for import completion`);
}

async function waitForBookVersionDone(
  supabase: SupabaseClient,
  versionId: string,
  timeoutMs: number
): Promise<{ row: BookVersionState; history: string[] }> {
  const startedAt = Date.now();
  const history: string[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("book_versions")
      .select("id, status, error_message")
      .eq("id", versionId)
      .maybeSingle();

    if (error) {
      throw new Error(`${FEATURE_PREFIX} failed to read book_versions status: ${error.message}`);
    }

    const row = data as BookVersionState | null;
    if (!row) {
      throw new Error(`${FEATURE_PREFIX} target book_version not found: ${versionId}`);
    }

    appendStatus(history, row.status);

    if (row.status === "failed") {
      throw new Error(`${FEATURE_PREFIX} translation failed: ${row.error_message ?? "unknown error"}`);
    }

    if (row.status === "done") {
      return { row, history };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${FEATURE_PREFIX} timeout waiting for translation completion`);
}

async function waitForAiJobCompletion(
  supabase: SupabaseClient,
  aiJobId: string,
  timeoutMs: number
): Promise<{ row: AiJobState; history: string[] }> {
  const startedAt = Date.now();
  const history: string[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("ai_jobs")
      .select("id, status, error")
      .eq("id", aiJobId)
      .maybeSingle();

    if (error) {
      throw new Error(`${FEATURE_PREFIX} failed to read ai_jobs status: ${error.message}`);
    }

    const row = data as AiJobState | null;
    if (!row) {
      throw new Error(`${FEATURE_PREFIX} ai_job not found: ${aiJobId}`);
    }

    appendStatus(history, row.status);

    if (row.status === "failed") {
      throw new Error(`${FEATURE_PREFIX} audiobook generation failed: ${row.error ?? "unknown error"}`);
    }

    if (row.status === "completed") {
      return { row, history };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${FEATURE_PREFIX} timeout waiting for audiobook completion`);
}

async function main(): Promise<void> {
  loadLocalEnvFiles();

  const supabaseUrl = process.env.SUPABASE_URL?.trim() || requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const redisUrl = requiredEnv("REDIS_URL");
  const targetLanguage = (process.env.PIPELINE_SMOKE_TARGET_LANGUAGE?.trim().toLowerCase() || "en");
  const sourceLanguage = (process.env.PIPELINE_SMOKE_SOURCE_LANGUAGE?.trim().toLowerCase() || "sv");
  const timeoutMs = Number(process.env.PIPELINE_SMOKE_TIMEOUT_MS ?? "300000");
  const audiobookBucket = process.env.AUDIOBOOK_STORAGE_BUCKET?.trim() || "audiobooks";

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${FEATURE_PREFIX} PIPELINE_SMOKE_TIMEOUT_MS must be a positive number`);
  }

  const redisConnection = parseRedisConnection(redisUrl);
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const importQueue = new Queue(IMPORT_QUEUE_NAME, { connection: redisConnection });
  const translationQueue = new Queue(TRANSLATION_QUEUE_NAME, { connection: redisConnection });
  const audiobookQueue = new Queue(AUDIOBOOK_QUEUE_NAME, { connection: redisConnection });

  const smokeId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const smokeEmail = `pipeline-smoke-${smokeId}@verkli.test`;
  const smokePassword = `Smoke-${crypto.randomBytes(6).toString("hex")}A1!`;

  try {
    console.log(`${FEATURE_PREFIX} starting run ${smokeId}`);

    await ensureBucket(supabase, IMPORT_BUCKET);
    await ensureBucket(supabase, audiobookBucket);

    const { data: authorUser, error: authorError } = await supabase.auth.admin.createUser({
      email: smokeEmail,
      password: smokePassword,
      email_confirm: true,
      user_metadata: { role: "author", full_name: "Pipeline Smoke Author" },
    });
    if (authorError || !authorUser?.user?.id) {
      throw new Error(`${FEATURE_PREFIX} failed to create smoke user: ${authorError?.message ?? "missing user id"}`);
    }

    const authorId = authorUser.user.id;
    const importId = crypto.randomUUID();
    const importFileName = `pipeline-smoke-${smokeId}.txt`;
    const importStoragePath = `${authorId}/${importId}.txt`;
    const importText = [
      `Pipeline smoke run ${smokeId}`,
      "",
      "Chapter 1",
      "",
      "This chapter verifies import and translation pipeline behavior.",
      "",
      "Chapter 2",
      "",
      "This chapter verifies audiobook generation and storage outputs.",
    ].join("\n");

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: authorId,
        display_name: "Pipeline Smoke Author",
        username: `pipeline-smoke-${smokeId}`,
        role: "author",
        is_public: false,
        preferences: {},
      },
      { onConflict: "user_id" }
    );
    if (profileError) {
      console.warn(`${FEATURE_PREFIX} profile upsert warning: ${profileError.message}`);
    }

    const { error: importUploadError } = await supabase.storage
      .from(IMPORT_BUCKET)
      .upload(importStoragePath, Buffer.from(importText, "utf8"), {
        contentType: "text/plain",
        upsert: true,
      });
    if (importUploadError) {
      throw new Error(`${FEATURE_PREFIX} failed to upload import file: ${importUploadError.message}`);
    }

    await assertStorageObjectExists(supabase, IMPORT_BUCKET, importStoragePath, "import source");

    const { error: importInsertError } = await supabase.from("book_imports").insert({
      id: importId,
      author_id: authorId,
      file_name: importFileName,
      file_path: importStoragePath,
      file_storage: "supabase",
      status: "pending",
      progress: 0,
    });
    if (importInsertError) {
      throw new Error(`${FEATURE_PREFIX} failed to create book_imports row: ${importInsertError.message}`);
    }

    await importQueue.add(
      "extract",
      {
        importId,
        filePath: importStoragePath,
        fileStorage: "supabase",
        authorId,
      },
      { jobId: importId }
    );

    const importResult = await waitForImportCompletion(supabase, importId, timeoutMs);
    assertStatusSequence(importResult.history, ["pending", "extracting", "completed"], "import");

    const bookId = importResult.row.book_id;
    const sourceVersionId = importResult.row.book_version_id;
    if (!bookId || !sourceVersionId) {
      throw new Error(`${FEATURE_PREFIX} import completed without book_id/book_version_id`);
    }

    if (sourceLanguage === targetLanguage) {
      throw new Error(
        `${FEATURE_PREFIX} source and target language cannot be the same (source=${sourceLanguage}, target=${targetLanguage})`
      );
    }

    const { error: sourceVersionLanguageError } = await supabase
      .from("book_versions")
      .update({ language_code: sourceLanguage })
      .eq("id", sourceVersionId);
    if (sourceVersionLanguageError) {
      throw new Error(
        `${FEATURE_PREFIX} failed to set source version language (${sourceLanguage}): ${sourceVersionLanguageError.message}`
      );
    }

    const { error: sourceBookLanguageError } = await supabase
      .from("books")
      .update({ language: sourceLanguage, original_language: sourceLanguage })
      .eq("id", bookId);
    if (sourceBookLanguageError) {
      throw new Error(
        `${FEATURE_PREFIX} failed to set source book language (${sourceLanguage}): ${sourceBookLanguageError.message}`
      );
    }

    const { count: sourceChapterCount, error: sourceChapterCountError } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_version_id", sourceVersionId);
    if (sourceChapterCountError) {
      throw new Error(`${FEATURE_PREFIX} failed to count source chapters: ${sourceChapterCountError.message}`);
    }
    if (!sourceChapterCount || sourceChapterCount <= 0) {
      throw new Error(`${FEATURE_PREFIX} import produced no source chapters`);
    }

    const { data: targetVersionRow, error: targetVersionError } = await supabase
      .from("book_versions")
      .insert({
        book_id: bookId,
        language_code: targetLanguage,
        status: "draft",
      })
      .select("id")
      .single();
    if (targetVersionError || !targetVersionRow?.id) {
      throw new Error(`${FEATURE_PREFIX} failed to create target draft version: ${targetVersionError?.message}`);
    }

    const targetVersionId = targetVersionRow.id;
    const translationJobId = `${bookId}-${targetLanguage}`;

    await translationQueue.add(
      "translate",
      {
        bookId,
        sourceVersionId,
        targetLanguage,
        targetVersionId,
        overwrite: true,
        authorId,
      },
      { jobId: translationJobId }
    );

    const translationResult = await waitForBookVersionDone(supabase, targetVersionId, timeoutMs);
    assertStatusSequence(translationResult.history, ["draft", "translating", "done"], "translation");

    const { count: translatedChapterCount, error: translatedChapterCountError } = await supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("book_version_id", targetVersionId);
    if (translatedChapterCountError) {
      throw new Error(`${FEATURE_PREFIX} failed to count translated chapters: ${translatedChapterCountError.message}`);
    }
    if (!translatedChapterCount || translatedChapterCount <= 0) {
      throw new Error(`${FEATURE_PREFIX} translation produced no chapters`);
    }
    if (translatedChapterCount !== sourceChapterCount) {
      throw new Error(
        `${FEATURE_PREFIX} translated chapter count mismatch source=${sourceChapterCount} translated=${translatedChapterCount}`
      );
    }

    const audiobookJobId = crypto.randomUUID();
    const { error: aiJobInsertError } = await supabase.from("ai_jobs").insert({
      id: audiobookJobId,
      user_id: authorId,
      kind: "audiobook_generation",
      book_id: bookId,
      book_version_id: targetVersionId,
      language: targetLanguage,
      status: "pending",
      progress: 0,
      input: {
        bookId,
        bookVersionId: targetVersionId,
        language: targetLanguage,
        voiceId: "smoke-voice",
        modelPath: "smoke-model",
        scope: "book",
        chapterId: null,
        chapterIds: null,
      },
      output: {
        totalChapters: translatedChapterCount,
        completedChapters: 0,
        currentChapterId: null,
        currentChapterTitle: null,
        audioPath: null,
        audioBucket: null,
        manifestPath: null,
        manifestBucket: null,
        scope: "book",
        chapterId: null,
        chapterIds: null,
        pauseRequested: false,
        cancelRequested: false,
        controlState: "queued",
        errorMessage: null,
      },
    });
    if (aiJobInsertError) {
      throw new Error(`${FEATURE_PREFIX} failed to create ai_jobs row: ${aiJobInsertError.message}`);
    }

    await audiobookQueue.add(
      "generate",
      {
        jobId: audiobookJobId,
        bookId,
        bookVersionId: targetVersionId,
        userId: authorId,
        language: targetLanguage,
        voiceId: "smoke-voice",
        modelPath: "smoke-model",
      },
      { jobId: audiobookJobId }
    );

    const audiobookResult = await waitForAiJobCompletion(supabase, audiobookJobId, timeoutMs);
    assertStatusSequence(audiobookResult.history, ["pending", "processing", "completed"], "audiobook");

    const { data: audiobookAsset, error: audiobookAssetError } = await supabase
      .from("audiobook_assets")
      .select("id, status, audio_bucket, audio_path")
      .eq("book_id", bookId)
      .eq("language", targetLanguage)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (audiobookAssetError) {
      throw new Error(`${FEATURE_PREFIX} failed to read audiobook_assets: ${audiobookAssetError.message}`);
    }

    const latestAsset = audiobookAsset as { id: string; status: string; audio_bucket: string | null; audio_path: string | null } | null;
    if (!latestAsset) {
      throw new Error(`${FEATURE_PREFIX} audiobook_assets row not found`);
    }
    if (latestAsset.status !== "generated") {
      throw new Error(`${FEATURE_PREFIX} audiobook_assets status is not generated: ${latestAsset.status}`);
    }
    if (!latestAsset.audio_path) {
      throw new Error(`${FEATURE_PREFIX} audiobook_assets missing audio_path`);
    }

    const assetBucket = latestAsset.audio_bucket || audiobookBucket;
    await assertStorageObjectExists(supabase, assetBucket, latestAsset.audio_path, "audiobook asset");

    const { data: cacheRow, error: cacheError } = await supabase
      .from("chapter_audio_cache")
      .select("audio_path")
      .eq("book_version_id", targetVersionId)
      .limit(1)
      .maybeSingle();
    if (cacheError) {
      throw new Error(`${FEATURE_PREFIX} failed to read chapter_audio_cache: ${cacheError.message}`);
    }

    const latestCache = cacheRow as { audio_path: string | null } | null;
    if (!latestCache?.audio_path) {
      throw new Error(`${FEATURE_PREFIX} chapter_audio_cache missing audio_path`);
    }
    await assertStorageObjectExists(supabase, assetBucket, latestCache.audio_path, "chapter cache");

    const { data: bookRow, error: bookStatusError } = await supabase
      .from("books")
      .select("audiobook_status")
      .eq("id", bookId)
      .maybeSingle();
    if (bookStatusError) {
      throw new Error(`${FEATURE_PREFIX} failed to read books.audiobook_status: ${bookStatusError.message}`);
    }

    const finalBookStatus = (bookRow as { audiobook_status?: string | null } | null)?.audiobook_status ?? null;
    if (finalBookStatus !== "published") {
      throw new Error(`${FEATURE_PREFIX} books.audiobook_status expected published, got ${finalBookStatus ?? "null"}`);
    }

    console.log(
      `${FEATURE_PREFIX} PASS ${JSON.stringify(
        {
          smokeId,
          importId,
          bookId,
          sourceVersionId,
          targetVersionId,
          audiobookJobId,
          importHistory: importResult.history,
          translationHistory: translationResult.history,
          audiobookHistory: audiobookResult.history,
          chapters: {
            source: sourceChapterCount,
            translated: translatedChapterCount,
          },
          storage: {
            import: { bucket: IMPORT_BUCKET, path: importStoragePath },
            audiobookAsset: { bucket: assetBucket, path: latestAsset.audio_path },
            chapterCache: { bucket: assetBucket, path: latestCache.audio_path },
          },
        },
        null,
        2
      )}`
    );
  } finally {
    await Promise.allSettled([importQueue.close(), translationQueue.close(), audiobookQueue.close()]);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${FEATURE_PREFIX} FAIL ${message}`);
  process.exit(1);
});
