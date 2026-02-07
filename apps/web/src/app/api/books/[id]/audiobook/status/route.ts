import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isAudiobookEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { sanitizeJobError } from "@/lib/sanitize-job-error";

const AI_JOB_KIND = "audiobook_generation";

type JobRow = {
  id: string;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  input: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

async function findLatestAudiobookJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bookId: string
): Promise<JobRow | null> {
  // Preferred lookup via identity columns.
  const { data: direct, error: directError } = await supabase
    .from("ai_jobs")
    .select("id, status, input, output, error, created_at, started_at, finished_at")
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
    .select("id, status, input, output, error, created_at, started_at, finished_at")
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
    return NextResponse.json(
      { error: "Audiobook status is temporarily unavailable in this environment" },
      { status: 503 }
    );
  }

  const { id: bookId } = await params;

  // SECURITY: Require author role
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Verify book ownership
  const { data: book } = await supabase
    .from("books")
    .select("id, author_id, audiobook_status")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const job = await findLatestAudiobookJob(supabase, user.id, bookId);

  // Get latest asset
  const { data: asset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_url, duration_seconds, status, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Extract progress from job output
  const output = job?.output ?? {};
  const hasGeneratedAsset = Boolean(asset?.audio_url) && asset?.status === "generated";
  const resolvedBookStatus =
    hasGeneratedAsset
      ? "published"
      : job?.status === "processing" || job?.status === "pending"
        ? "generating"
        : job?.status === "failed"
          ? "failed"
          : (book.audiobook_status ?? "not_started");

  return NextResponse.json({
    bookStatus: resolvedBookStatus,
    rawBookStatus: book.audiobook_status,
    job: job
      ? {
          id: job.id,
          status: job.status,
          totalChapters: output.totalChapters ?? 0,
          completedChapters: output.completedChapters ?? 0,
          currentChapterId: output.currentChapterId ?? null,
          currentChapterTitle: output.currentChapterTitle ?? null,
          audioUrl: output.audioUrl ?? null,
          manifestUrl: output.manifestUrl ?? null,
          durationSeconds: output.durationSeconds ?? null,
          error: sanitizeJobError(job.error) ?? sanitizeJobError(output.errorDetails as string) ?? null,
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        }
      : null,
    asset: asset
      ? {
          id: asset.id,
          audioUrl: asset.audio_url,
          durationSeconds: asset.duration_seconds,
          status: asset.status,
          createdAt: asset.created_at,
        }
      : null,
  });
}
