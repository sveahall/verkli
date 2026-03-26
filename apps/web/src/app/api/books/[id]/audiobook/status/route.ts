import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { normalizeJobStatus } from "@/lib/job-status";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { resolveSanitizedJobError } from "@/lib/sanitize-job-error";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import { getBookAsOwner } from "@/lib/books/service";
import {
  apiError,
  E_AUDIOBOOK_STATUS_UNAVAILABLE,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
} from "@/lib/api-errors";
import { isCancelStale, forceFailCancelledJob } from "@/lib/audiobook-stale-cancel";

const AI_JOB_KIND = "audiobook_generation";
const SIGNED_URL_TTL_SECONDS = 60 * 15;

function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

async function signAudioPath(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null,
  bucket: string
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[audiobook status] failed to sign audio path", {
      bucket,
      path,
      message: error?.message ?? "missing signedUrl",
    });
    return null;
  }
  return data.signedUrl;
}

type JobRow = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  input: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

async function findLatestAudiobookJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookId: string
): Promise<JobRow | null> {
  // Preferred lookup via identity columns.
  const { data: direct, error: directError } = await supabase
    .from("ai_jobs")
    .select("id, status, input, output, error, created_at, started_at, finished_at, updated_at")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (directError) {
    console.warn("[audiobook status] lookup by book_id failed:", directError.message);
  }
  if (direct) {
    return {
      ...direct,
      input: (direct.input as Record<string, unknown> | null) ?? null,
      output: (direct.output as Record<string, unknown> | null) ?? null,
    };
  }

  // Legacy fallback for pre-backfill rows.
  const { data: legacyRows, error: legacyError } = await supabase
    .from("ai_jobs")
    .select("id, status, input, output, error, created_at, started_at, finished_at, updated_at")
    .eq("kind", AI_JOB_KIND)
    .eq("user_id", userId)
    .is("book_id", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (legacyError) {
    console.warn("[audiobook status] legacy lookup failed:", legacyError.message);
    return null;
  }

  const match = (legacyRows ?? []).find((row) => {
    const input = row.input as Record<string, unknown> | null;
    return input?.bookId === bookId;
  });

  if (!match) return null;
  return {
    ...match,
    input: (match.input as Record<string, unknown> | null) ?? null,
    output: (match.output as Record<string, unknown> | null) ?? null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isAudiobookEnabled()) {
    return apiError(E_AUDIOBOOK_STATUS_UNAVAILABLE, 503);
  }

  const { id: bookId } = await params;

  // SECURITY: Require author role
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();
  const admin = createAdminClient();
  const defaultBucket = getAudiobookStorageBucket();

  // Verify book ownership
  const bookResult = await getBookAsOwner(supabase, bookId, user.id, "id, author_id, audiobook_status");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }
  const book = bookResult.data as { id: string; author_id: string; audiobook_status?: string | null };

  let job = await findLatestAudiobookJob(supabase, user.id, bookId);

  // Auto-reap stuck cancel_requested jobs after the staleness timeout.
  if (
    job &&
    (job.status === "processing" || job.status === "pending") &&
    isCancelStale(job.output, job.updated_at)
  ) {
    const failedOutput = await forceFailCancelledJob(job.id, job.output ?? {});
    job = { ...job, status: "failed", output: failedOutput, finished_at: new Date().toISOString() };
  }

  // Get latest asset
  const { data: asset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_path, duration_seconds, status, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Extract progress from job output
  const output = job?.output ?? {};
  const normalizedJobStatus = job ? normalizeJobStatus(job.status) : null;
  const assetAudioPath = normalizeStoragePath(asset?.audio_path);
  const assetBucket = defaultBucket;
  const hasGeneratedAsset = Boolean(assetAudioPath) && asset?.status === "generated";
  const chapterIds =
    Array.isArray(output.chapterIds) && output.chapterIds.every((id) => typeof id === "string")
      ? (output.chapterIds as string[])
      : null;
  const controlState = typeof output.controlState === "string" ? output.controlState : null;
  const pauseRequested = output.pauseRequested === true;
  const cancelRequested = output.cancelRequested === true;
  const outputAudioPath = normalizeStoragePath(output.audioPath);
  const outputAudioBucket =
    typeof output.audioBucket === "string" && output.audioBucket.trim().length > 0
      ? output.audioBucket.trim()
      : defaultBucket;
  const outputManifestPath = normalizeStoragePath(output.manifestPath);
  const outputManifestBucket =
    typeof output.manifestBucket === "string" && output.manifestBucket.trim().length > 0
      ? output.manifestBucket.trim()
      : defaultBucket;
  const outputGeneratedChapterAudioPath =
    normalizeStoragePath(output.generatedChapterAudioPath);
  const outputGeneratedChapterAudioBucket =
    typeof output.generatedChapterAudioBucket === "string" &&
    output.generatedChapterAudioBucket.trim().length > 0
      ? output.generatedChapterAudioBucket.trim()
      : defaultBucket;
  const [outputAudioUrl, outputManifestUrl, outputGeneratedChapterAudioUrl, assetAudioUrl] = await Promise.all([
    signAudioPath(admin, outputAudioPath, outputAudioBucket),
    signAudioPath(admin, outputManifestPath, outputManifestBucket),
    signAudioPath(admin, outputGeneratedChapterAudioPath, outputGeneratedChapterAudioBucket),
    signAudioPath(admin, assetAudioPath, assetBucket),
  ]);
  const resolvedBookStatus =
    hasGeneratedAsset
      ? "published"
      : normalizedJobStatus === "running" || normalizedJobStatus === "pending"
        ? "generating"
        : normalizedJobStatus === "failed"
          ? "failed"
          : (book.audiobook_status ?? "not_started");

  return NextResponse.json({
    bookStatus: resolvedBookStatus,
    rawBookStatus: book.audiobook_status,
    job: job
      ? {
          id: job.id,
          status: normalizedJobStatus ?? "pending",
          totalChapters: output.totalChapters ?? 0,
          completedChapters: output.completedChapters ?? 0,
          currentChapterId: output.currentChapterId ?? null,
          currentChapterTitle: output.currentChapterTitle ?? null,
          scope:
            (typeof output.scope === "string" ? output.scope : null) ??
            (typeof job.input?.scope === "string" ? job.input.scope : "book"),
          chapterId:
            (typeof output.chapterId === "string" ? output.chapterId : null) ??
            (typeof job.input?.chapterId === "string" ? job.input.chapterId : null),
          chapterIds:
            chapterIds ??
            (Array.isArray(job.input?.chapterIds) && job.input?.chapterIds.every((id) => typeof id === "string")
              ? (job.input.chapterIds as string[])
              : null),
          audioPath: outputAudioPath,
          audioBucket: outputAudioBucket,
          audioUrl: outputAudioUrl,
          manifestPath: outputManifestPath,
          manifestBucket: outputManifestBucket,
          manifestUrl: outputManifestUrl,
          generatedChapterAudioPath: outputGeneratedChapterAudioPath,
          generatedChapterAudioBucket: outputGeneratedChapterAudioBucket,
          generatedChapterAudioUrl: outputGeneratedChapterAudioUrl,
          durationSeconds: output.durationSeconds ?? null,
          controlState,
          pauseRequested,
          cancelRequested,
          error: resolveSanitizedJobError(
            job.error,
            typeof output.errorMessage === "string"
              ? output.errorMessage
              : typeof output.errorDetails === "string"
                ? output.errorDetails
                : null
          ),
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        }
      : null,
    asset: asset
      ? {
          id: asset.id,
          audioPath: assetAudioPath,
          audioBucket: assetBucket,
          audioUrl: assetAudioUrl,
          durationSeconds: asset.duration_seconds,
          status: asset.status,
          createdAt: asset.created_at,
        }
      : null,
  });
}
