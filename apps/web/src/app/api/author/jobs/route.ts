import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { apiError, E_DATABASE_ERROR, E_JOB_FETCH_FAILED } from "@/lib/api-errors";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { normalizeJobStatus } from "@/lib/job-status";
import { sanitizeJobError } from "@/lib/sanitize-job-error";

type AuthorJobKind = "audiobook" | "translation" | "marketing";

type AuthorJob = {
  id: string;
  kind: AuthorJobKind;
  status: "pending" | "running" | "completed" | "failed";
  bookId: string;
  bookTitle: string;
  language: string | null;
  progress: number;
  previewUrl: string | null;
  logSummary: string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  meta: Record<string, unknown>;
};

const SIGNED_URL_TTL_SECONDS = 60 * 15;

function normalizePreviewPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function isManifestPath(path: string | null): boolean {
  return Boolean(path && path.toLowerCase().endsWith(".json"));
}

async function signStoragePath(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null,
  bucket: string,
  logPrefix: string,
  logMeta: Record<string, unknown>
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error(logPrefix, {
      ...logMeta,
      bucket,
      path,
      message: error?.message ?? "missing signedUrl",
    });
    return null;
  }

  return data.signedUrl;
}

function toTranslationProgress(status: string): number {
  const normalized = normalizeJobStatus(status);
  if (normalized === "completed") return 100;
  if (normalized === "running") return 55;
  if (normalized === "failed") return 0;
  return 10;
}

function toMarketingProgress(status: string): number {
  const normalized = normalizeJobStatus(status);
  if (normalized === "completed") return 100;
  if (normalized === "running") return 70;
  if (normalized === "failed") return 0;
  return 15;
}

function getAudiobookLogSummary(
  status: AuthorJob["status"],
  output: Record<string, unknown>,
  error: string | null
) {
  if (error) return error;

  const currentChapterTitle =
    typeof output.currentChapterTitle === "string"
      ? output.currentChapterTitle.trim()
      : "";

  if (status === "completed") {
    return "Audiobook ready for review.";
  }

  if (status === "running" && currentChapterTitle) {
    return `Generating audio for ${currentChapterTitle}.`;
  }

  if (status === "running") {
    return "Generating audiobook.";
  }

  if (status === "failed") {
    return "Audiobook generation failed.";
  }

  return "Audiobook queued.";
}

export async function GET() {
  const auth = await requireAuthorRoleForApi();
  if (auth.response) return auth.response;

  const supabase = await createClient();
  const admin = createAdminClient();
  const defaultBucket = getAudiobookStorageBucket();

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title")
    .eq("author_id", auth.user.id)
    .order("updated_at", { ascending: false });

  if (booksError) {
    console.error("[author jobs] books load failed", {
      userId: auth.user.id,
      message: booksError.message,
      code: booksError.code,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const bookIds = (books ?? []).map((book) => book.id);
  if (bookIds.length === 0) {
    return NextResponse.json({ jobs: [] satisfies AuthorJob[] });
  }

  const bookTitleById = new Map(
    (books ?? []).map((book) => [book.id, book.title ?? "Untitled"] as const)
  );

  const [
    audiobookAssetsResult,
    audiobookJobsResult,
    translationJobsResult,
    marketingJobsResult,
  ] = await Promise.all([
    supabase
      .from("audiobook_assets")
      .select("book_id, audio_path, audio_bucket, created_at")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_jobs")
      .select("id, kind, status, book_id, book_version_id, language, progress, input, output, error, created_at, started_at, finished_at")
      .in("book_id", bookIds)
      .in("kind", ["audiobook", "audiobook_generation"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("book_versions")
      .select("id, book_id, language_code, status, created_at, updated_at")
      .in("book_id", bookIds)
      .in("status", ["queued", "translating", "done", "failed"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("marketing_campaigns")
      .select("id, book_id, channel, status, headline, share_url, created_at, updated_at")
      .in("book_id", bookIds)
      .order("updated_at", { ascending: false }),
  ]);

  if (
    audiobookAssetsResult.error ||
    audiobookJobsResult.error ||
    translationJobsResult.error ||
    marketingJobsResult.error
  ) {
    console.error("[author jobs] job aggregation failed", {
      userId: auth.user.id,
      audiobookAssetsError: audiobookAssetsResult.error?.message ?? null,
      audiobookJobsError: audiobookJobsResult.error?.message ?? null,
      translationJobsError: translationJobsResult.error?.message ?? null,
      marketingJobsError: marketingJobsResult.error?.message ?? null,
    });
    return apiError(E_JOB_FETCH_FAILED, 500);
  }

  const latestAssetByBookId = new Map<
    string,
    { audioPath: string | null; audioBucket: string | null }
  >();
  for (const asset of audiobookAssetsResult.data ?? []) {
    if (latestAssetByBookId.has(asset.book_id)) continue;
    latestAssetByBookId.set(asset.book_id, {
      audioPath: normalizePreviewPath(asset.audio_path),
      audioBucket: asset.audio_bucket ?? null,
    });
  }

  const previewByBookId = new Map<
    string,
    { audioUrl: string | null; manifestUrl: string | null }
  >();
  await Promise.all(
    [...latestAssetByBookId.entries()].map(async ([bookId, asset]) => {
      if (!asset.audioPath) {
        previewByBookId.set(bookId, { audioUrl: null, manifestUrl: null });
        return;
      }

      const bucket = asset.audioBucket?.trim() || defaultBucket;
      const signedUrl = await signStoragePath(
        admin,
        asset.audioPath,
        bucket,
        "[author jobs] preview sign failed",
        { bookId }
      );

      previewByBookId.set(bookId, {
        audioUrl: isManifestPath(asset.audioPath) ? null : signedUrl,
        manifestUrl: isManifestPath(asset.audioPath) ? signedUrl : null,
      });
    })
  );

  const audiobookJobs: AuthorJob[] = await Promise.all(
    (audiobookJobsResult.data ?? [])
      .filter((row) => typeof row.book_id === "string" && row.book_id.length > 0)
      .map(async (row) => {
        const status = normalizeJobStatus(row.status);
        const bookId = row.book_id as string;
        const output =
          row.output && typeof row.output === "object"
            ? (row.output as Record<string, unknown>)
            : {};
        const safeError = sanitizeJobError(row.error);
        const audioPath = normalizePreviewPath(output.audioPath);
        const audioBucket =
          typeof output.audioBucket === "string" && output.audioBucket.trim().length > 0
            ? output.audioBucket.trim()
            : defaultBucket;
        const manifestPath = normalizePreviewPath(output.manifestPath);
        const manifestBucket =
          typeof output.manifestBucket === "string" && output.manifestBucket.trim().length > 0
            ? output.manifestBucket.trim()
            : defaultBucket;
        const generatedChapterAudioPath = normalizePreviewPath(output.generatedChapterAudioPath);
        const generatedChapterAudioBucket =
          typeof output.generatedChapterAudioBucket === "string" &&
          output.generatedChapterAudioBucket.trim().length > 0
            ? output.generatedChapterAudioBucket.trim()
            : defaultBucket;
        const [audioUrl, manifestUrl, generatedChapterAudioUrl] = await Promise.all([
          signStoragePath(admin, audioPath, audioBucket, "[author jobs] output audio sign failed", {
            bookId,
            jobId: row.id,
          }),
          signStoragePath(admin, manifestPath, manifestBucket, "[author jobs] output manifest sign failed", {
            bookId,
            jobId: row.id,
          }),
          signStoragePath(
            admin,
            generatedChapterAudioPath,
            generatedChapterAudioBucket,
            "[author jobs] generated chapter audio sign failed",
            {
              bookId,
              jobId: row.id,
            }
          ),
        ]);
        const assetPreview = previewByBookId.get(bookId) ?? {
          audioUrl: null,
          manifestUrl: null,
        };
        return {
          id: row.id,
          kind: "audiobook",
          status,
          bookId,
          bookTitle: bookTitleById.get(bookId) ?? "Untitled",
          language: row.language ?? null,
          progress: Number.isFinite(row.progress) ? Math.max(0, Math.min(100, row.progress)) : 0,
          previewUrl:
            generatedChapterAudioUrl ??
            audioUrl ??
            assetPreview.audioUrl ??
            (typeof output.audioUrl === "string" ? output.audioUrl : null),
          logSummary: getAudiobookLogSummary(status, output, safeError),
          createdAt: row.created_at ?? null,
          startedAt: row.started_at ?? null,
          finishedAt: row.finished_at ?? null,
          error: safeError,
          meta: {
            ...(row.input && typeof row.input === "object"
              ? (row.input as Record<string, unknown>)
              : {}),
            ...output,
            audioUrl,
            manifestUrl: manifestUrl ?? assetPreview.manifestUrl,
            generatedChapterAudioUrl,
            assetAudioUrl: assetPreview.audioUrl,
            assetManifestUrl: assetPreview.manifestUrl,
          },
        };
      })
  );

  const translationJobs: AuthorJob[] = (translationJobsResult.data ?? []).map((row) => {
    const status = normalizeJobStatus(row.status);
    const language = row.language_code ?? null;
    return {
      id: row.id,
      kind: "translation",
      status,
      bookId: row.book_id,
      bookTitle: bookTitleById.get(row.book_id) ?? "Untitled",
      language,
      progress: toTranslationProgress(row.status),
      previewUrl: null,
      logSummary:
        status === "completed"
          ? `Translation ready in ${(language ?? "unknown").toUpperCase()}.`
          : status === "running"
            ? `Translating to ${(language ?? "unknown").toUpperCase()}.`
            : status === "failed"
              ? `Translation failed for ${(language ?? "unknown").toUpperCase()}.`
              : `Translation queued for ${(language ?? "unknown").toUpperCase()}.`,
      createdAt: row.created_at ?? row.updated_at ?? null,
      startedAt: status === "running" ? row.updated_at ?? null : null,
      finishedAt: status === "completed" || status === "failed" ? row.updated_at ?? null : null,
      error: status === "failed" ? "Translation failed." : null,
      meta: {
        languageCode: language,
        bookVersionId: row.id,
      },
    };
  });

  const marketingJobs: AuthorJob[] = (marketingJobsResult.data ?? []).map((row) => {
    const status = normalizeJobStatus(row.status);
    return {
      id: row.id,
      kind: "marketing",
      status,
      bookId: row.book_id,
      bookTitle: bookTitleById.get(row.book_id) ?? "Untitled",
      language: null,
      progress: toMarketingProgress(row.status),
      previewUrl: row.share_url ?? null,
      logSummary: row.headline?.trim() || `${row.channel} asset ready for review.`,
      createdAt: row.created_at ?? row.updated_at ?? null,
      startedAt: status === "running" ? row.updated_at ?? null : null,
      finishedAt: status === "completed" || status === "failed" ? row.updated_at ?? null : null,
      error: status === "failed" ? "Marketing asset generation failed." : null,
      meta: {
        channel: row.channel,
      },
    };
  });

  const jobs = [...audiobookJobs, ...translationJobs, ...marketingJobs].sort((left, right) => {
    const leftTs = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTs = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTs - leftTs;
  });

  return NextResponse.json({ jobs });
}
